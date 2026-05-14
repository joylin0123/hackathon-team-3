import json
import time

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
    try:
        accel = sensor.acceleration   # (x, y, z) m/s²
        gyro = sensor.gyro            # (x, y, z) rad/s
        mag = sensor.magnetic         # (x, y, z) µT
        cal = sensor.calibration_status  # (sys, gyro, accel, mag) 0–3
        return {
            "accel": {"x": accel[0], "y": accel[1], "z": accel[2]},
            "gyro":  {"x": gyro[0],  "y": gyro[1],  "z": gyro[2]},
            "mag":   {"x": mag[0],   "y": mag[1],   "z": mag[2]},
            "cal":   {"sys": cal[0], "gyro": cal[1], "accel": cal[2], "mag": cal[3]},
        }
    except Exception as e:
        return {"error": str(e)}


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

    try:
        while True:
            loop_start = time.time()

            gps = read_gps(gps_port)
            payload = {
                "device_id": DEVICE_ID,
                "timestamp": int(time.time() * 1000),
                "gps": gps,
            }
            if imu:
                payload["imu"] = read_imu(imu)

            mqtt_connection.publish(
                topic=TOPIC,
                payload=json.dumps(payload),
                qos=mqtt.QoS.AT_LEAST_ONCE,
            )
            print(f"Published: fix={gps['fix']} lat={gps.get('lat')} lon={gps.get('lon')}")

            time.sleep(max(0.0, PUBLISH_INTERVAL - (time.time() - loop_start)))

    except KeyboardInterrupt:
        print("Disconnecting...")
        gps_port.close()
        mqtt_connection.disconnect().result()


if __name__ == "__main__":
    main()
