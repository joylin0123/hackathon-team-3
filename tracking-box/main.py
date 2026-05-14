import json
import math
import time
from datetime import datetime, timezone

import serial
from awscrt import mqtt
from awsiot import mqtt_connection_builder
from config import (
    ENDPOINT, CERT_PATH, KEY_PATH, ROOT_CA_PATH,
    DEVICE_ID
)

TOPIC = "tracking-box-data"
GPS_DEVICE = "/dev/ttyACM0"
GPS_BAUD = 9600
PUBLISH_INTERVAL = 1.0  # seconds

TEAM_ID = 3
SESSION_ID = int(time.time())  # fixed once per process start — distinguishes runs

# The flat telemetry contract: exactly these 40 keys map 1:1 to the shared Athena table.
PAYLOAD_KEYS = frozenset({
    "timestamp", "team_id", "session_id",
    "latitude", "longitude", "altitude", "speed", "course", "satellites", "gps_timestamp",
    "acc_x", "acc_y", "acc_z", "gyro_x", "gyro_y", "gyro_z", "mag_x", "mag_y", "mag_z",
    "status_mag", "status_gyro", "status_acc", "status_sys",
    "pitch_rate", "roll_rate", "yaw_rate", "pitch_angle", "roll_angle", "yaw_angle",
    "temperature", "gravity_x", "gravity_y", "gravity_z",
    "abs_orientation_x", "abs_orientation_y", "abs_orientation_z", "abs_orientation_w",
    "linear_acc_x", "linear_acc_y", "linear_acc_z",
})


def _finite(v):
    """Pass finite numbers through; map None / NaN / Inf to None (→ SQL NULL)."""
    if isinstance(v, (int, float)) and math.isfinite(v):
        return v
    return None


def _rad(deg):
    """Degrees → radians, None-safe."""
    return math.radians(deg) if deg is not None else None


def _xyz(triple):
    """Normalise a BNO055 (x, y, z) reading — handles None and (None, None, None)."""
    if not triple:
        return (None, None, None)
    return (_finite(triple[0]), _finite(triple[1]), _finite(triple[2]))


def parse_nmea_coord(value: str, direction: str) -> float | None:
    """Convert NMEA ddmm.mmmm + hemisphere to decimal degrees."""
    if not value:
        return None
    if direction in ("N", "S"):
        degrees = int(value[:2])
        minutes = float(value[2:])
    else:
        degrees = int(value[:3])
        minutes = float(value[3:])
    decimal = degrees + minutes / 60.0
    if direction in ("S", "W"):
        decimal = -decimal
    return decimal


def nmea_to_epoch_ms(date_utc, time_utc):
    """Combine NMEA date (ddmmyy) + time (hhmmss.ss) into a UTC epoch-ms int, or None."""
    if not date_utc or not time_utc:
        return None
    try:
        day = int(date_utc[0:2])
        month = int(date_utc[2:4])
        year = 2000 + int(date_utc[4:6])
        hour = int(time_utc[0:2])
        minute = int(time_utc[2:4])
        seconds = float(time_utc[4:])
        whole = int(seconds)
        micro = int(round((seconds - whole) * 1_000_000))
        dt = datetime(year, month, day, hour, minute, whole, micro, tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except (ValueError, TypeError):
        return None


def _strip_checksum(line: str) -> str:
    idx = line.rfind("*")
    return line[:idx] if idx != -1 else line


def read_gps(port: serial.Serial) -> dict:
    """Collect one cycle of NMEA sentences and parse all available fields."""
    targets = {"$GPRMC", "$GPGGA", "$GPGSA", "$GPVTG", "$GPGLL"}
    collected = {}
    deadline = time.time() + 2.0

    while time.time() < deadline:
        try:
            line = port.readline().decode("ascii", errors="ignore").strip()
        except Exception:
            return {"status": "read_error"}
        for prefix in targets:
            if line.startswith(prefix):
                collected[prefix] = _strip_checksum(line).split(",")
                break
        if targets <= collected.keys():
            break

    if not collected:
        return {"status": "timeout"}

    result = {
        "fix": False, "status": "no_fix",
        "lat": None, "lon": None,
        "time_utc": None, "date_utc": None,
    }

    # $GPRMC: time, date, fix, lat, lon, speed, course
    rmc = collected.get("$GPRMC", [])
    if len(rmc) > 9:
        result["time_utc"] = rmc[1] or None
        result["date_utc"] = rmc[9] or None
        if rmc[2] == "A":
            result["fix"] = True
            result["status"] = "ok"
            result["lat"] = parse_nmea_coord(rmc[3], rmc[4])
            result["lon"] = parse_nmea_coord(rmc[5], rmc[6])
            result["speed_knots"] = float(rmc[7]) if rmc[7] else None
            result["speed_kmh"] = round(float(rmc[7]) * 1.852, 2) if rmc[7] else None
            result["course_deg"] = float(rmc[8]) if rmc[8] else None

    # $GPGGA: fix quality, satellite count, HDOP, altitude, geoid separation
    gga = collected.get("$GPGGA", [])
    if len(gga) > 11:
        result["fix_quality"] = int(gga[6]) if gga[6] else 0
        result["satellites"] = int(gga[7]) if gga[7] else 0
        result["hdop"] = float(gga[8]) if gga[8] else None
        result["altitude_m"] = float(gga[9]) if gga[9] else None
        result["geoid_sep_m"] = float(gga[11]) if gga[11] else None

    # $GPGSA: fix type (2D/3D), PDOP, HDOP, VDOP
    gsa = collected.get("$GPGSA", [])
    if len(gsa) > 17:
        fix_type = int(gsa[2]) if gsa[2] else 1
        result["fix_type"] = {1: "none", 2: "2D", 3: "3D"}.get(fix_type, "unknown")
        result["pdop"] = float(gsa[15]) if gsa[15] else None
        result["hdop"] = float(gsa[16]) if gsa[16] else result.get("hdop")
        result["vdop"] = float(gsa[17]) if gsa[17] else None

    # $GPVTG: true + magnetic course, speed in knots and km/h
    vtg = collected.get("$GPVTG", [])
    if len(vtg) > 7:
        result["course_true_deg"] = float(vtg[1]) if vtg[1] else None
        result["course_mag_deg"] = float(vtg[3]) if vtg[3] else None
        if not result.get("speed_knots") and vtg[5]:
            result["speed_knots"] = float(vtg[5])
        if not result.get("speed_kmh") and vtg[7]:
            result["speed_kmh"] = round(float(vtg[7]), 2)

    # $GPGLL: lat, lon, time, status (fills gaps if GPRMC missing)
    gll = collected.get("$GPGLL", [])
    if len(gll) > 5:
        result["gll_status"] = gll[5] or None
        if result["lat"] is None and gll[1] and gll[2]:
            result["lat"] = parse_nmea_coord(gll[1], gll[2])
        if result["lon"] is None and gll[3] and gll[4]:
            result["lon"] = parse_nmea_coord(gll[3], gll[4])

    return result


def init_imu():
    """Initialize BNO055 via MCP2221A. Requires BLINKA_MCP2221=1 in env."""
    try:
        import board
        import adafruit_bno055
        return adafruit_bno055.BNO055_I2C(board.I2C())
    except Exception as e:
        print(f"IMU unavailable: {e}")
        return None


def read_imu(sensor) -> dict:
    """Read raw + fused BNO055 outputs. Returns an all-None template on any failure."""
    empty = {
        "accel": (None, None, None),
        "gyro": (None, None, None),
        "mag": (None, None, None),
        "cal": (None, None, None, None),
        "euler": (None, None, None),
        "quaternion": (None, None, None, None),
        "gravity": (None, None, None),
        "linear_accel": (None, None, None),
        "temperature": None,
    }
    if sensor is None:
        return empty
    try:
        cal = sensor.calibration_status or (None, None, None, None)
        quat = sensor.quaternion or (None, None, None, None)
        return {
            "accel": _xyz(sensor.acceleration),       # (x, y, z) m/s²
            "gyro": _xyz(sensor.gyro),                # (x, y, z) rad/s
            "mag": _xyz(sensor.magnetic),             # (x, y, z) µT
            "cal": (cal[0], cal[1], cal[2], cal[3]),  # (sys, gyro, accel, mag) 0–3
            "euler": _xyz(sensor.euler),              # (heading, roll, pitch) degrees
            "quaternion": (_finite(quat[0]), _finite(quat[1]),
                           _finite(quat[2]), _finite(quat[3])),  # (w, x, y, z)
            "gravity": _xyz(sensor.gravity),                  # (x, y, z) m/s²
            "linear_accel": _xyz(sensor.linear_acceleration),  # (x, y, z) m/s²
            "temperature": _finite(sensor.temperature),        # °C
        }
    except Exception as e:
        print(f"IMU read failed: {e}")
        return empty


def build_payload(gps, imu, team_id, session_id):
    """Flatten one GPS + IMU reading into the flat 40-column telemetry contract."""
    course_deg = _finite(gps.get("course_deg"))
    accel = imu["accel"]
    gyro = imu["gyro"]
    mag = imu["mag"]
    cal = imu["cal"]
    euler = imu["euler"]
    quat = imu["quaternion"]
    gravity = imu["gravity"]
    linear = imu["linear_accel"]

    out = {
        "timestamp": int(time.time() * 1000),
        "team_id": team_id,
        "session_id": session_id,

        "latitude": _finite(gps.get("lat")),
        "longitude": _finite(gps.get("lon")),
        "altitude": _finite(gps.get("altitude_m")),
        "speed": _finite(gps.get("speed_kmh")),
        "course": round(course_deg) if course_deg is not None else None,
        "satellites": gps.get("satellites"),
        "gps_timestamp": nmea_to_epoch_ms(gps.get("date_utc"), gps.get("time_utc")),

        "acc_x": accel[0], "acc_y": accel[1], "acc_z": accel[2],
        "gyro_x": gyro[0], "gyro_y": gyro[1], "gyro_z": gyro[2],
        "mag_x": mag[0], "mag_y": mag[1], "mag_z": mag[2],

        # calibration_status order is (sys, gyro, accel, mag)
        "status_sys": cal[0], "status_gyro": cal[1],
        "status_acc": cal[2], "status_mag": cal[3],

        # angular velocity is the gyro reading; *_rate columns mirror gyro_x/y/z
        "roll_rate": gyro[0], "pitch_rate": gyro[1], "yaw_rate": gyro[2],

        # euler is (heading=yaw, roll, pitch) in degrees — columns want radians
        "roll_angle": _rad(euler[1]), "pitch_angle": _rad(euler[2]), "yaw_angle": _rad(euler[0]),

        "temperature": _finite(imu["temperature"]),

        "gravity_x": gravity[0], "gravity_y": gravity[1], "gravity_z": gravity[2],

        # quaternion is (w, x, y, z) — w is first
        "abs_orientation_w": quat[0], "abs_orientation_x": quat[1],
        "abs_orientation_y": quat[2], "abs_orientation_z": quat[3],

        "linear_acc_x": linear[0], "linear_acc_y": linear[1], "linear_acc_z": linear[2],
    }
    assert set(out) == PAYLOAD_KEYS, "build_payload drifted from the 40-column contract"
    return out


def main():
    mqtt_connection = mqtt_connection_builder.mtls_from_path(
        endpoint=ENDPOINT,
        cert_filepath=CERT_PATH,
        pri_key_filepath=KEY_PATH,
        ca_filepath=ROOT_CA_PATH,
        client_id=DEVICE_ID,
        clean_session=False,
        keep_alive_secs=30,
    )

    print(f"Connecting to {ENDPOINT}...")
    mqtt_connection.connect().result()
    print("Connected!")

    gps_port = serial.Serial(GPS_DEVICE, GPS_BAUD, timeout=1)
    imu = init_imu()
    print(f"Session {SESSION_ID} — publishing to {TOPIC}")

    try:
        while True:
            loop_start = time.time()

            gps = read_gps(gps_port)
            payload = build_payload(gps, read_imu(imu), TEAM_ID, SESSION_ID)

            mqtt_connection.publish(
                topic=TOPIC,
                payload=json.dumps(payload),
                qos=mqtt.QoS.AT_LEAST_ONCE,
            )
            print(f"Published: fix={gps.get('fix')} lat={gps.get('lat')} lon={gps.get('lon')}")

            time.sleep(max(0.0, PUBLISH_INTERVAL - (time.time() - loop_start)))

    except KeyboardInterrupt:
        print("Disconnecting...")
        gps_port.close()
        mqtt_connection.disconnect().result()


if __name__ == "__main__":
    main()
