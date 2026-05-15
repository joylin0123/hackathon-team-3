import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { IDEAL_LINE } from '../../constants/zandvoort';
import type { TrackVizProps } from './TrackVizProps';

// Demo key — HTTP-referrer-restricted in Google Cloud Console. Prefer VITE_GOOGLE_MAPS_API_KEY in .env.local for local dev.
const GOOGLE_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || 'AIzaSyCCq3IjcFFqzI-ciwEfTEnZlzkXSfmEyVk';

// Circuit bounding-box centre is ~52.3884N 4.5470E (lat span ~820 m, lon span ~960 m).
// Camera sits ~400 m south of centre, looks due north, pitched 70° down at
// 2200 m altitude. Vertical FOV (default 60°) ground-projects to ~2.7 km
// north-south — wide enough that Tarzan (north) and Arie Luyendyk (south) both
// stay well inside frame, with enough oblique tilt to keep the grandstands
// and dune topography reading as 3D.
const CAM_CENTER_LON = 4.5470;
const CAM_CENTER_LAT = 52.3845;
const CAM_HEIGHT_M = 2200;
const CAM_HEADING_DEG = 0;
const CAM_PITCH_DEG = -70;

// Vertical offset so the racing line and car sit just above the asphalt without z-fighting.
const SURFACE_LIFT_M = 2;

function lockCamera(viewer: Cesium.Viewer) {
  const c = viewer.scene.screenSpaceCameraController;
  c.enableRotate = false;
  c.enableTranslate = false;
  c.enableZoom = false;
  c.enableTilt = false;
  c.enableLook = false;
}

function applyBroadcastFraming(viewer: Cesium.Viewer) {
  viewer.scene.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(CAM_CENTER_LON, CAM_CENTER_LAT, CAM_HEIGHT_M),
    orientation: {
      heading: Cesium.Math.toRadians(CAM_HEADING_DEG),
      pitch: Cesium.Math.toRadians(CAM_PITCH_DEG),
      roll: 0,
    },
  });
}

export function Live1Photoreal({ latest, replayRecord }: TrackVizProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
  const carEntityRef = useRef<Cesium.Entity | null>(null);
  const polylineEntityRef = useRef<Cesium.Entity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Init viewer once
  useEffect(() => {
    if (!containerRef.current) return;

    if (!GOOGLE_KEY) {
      setError('Set VITE_GOOGLE_MAPS_API_KEY in frontend/.env.local to enable Google Photorealistic 3D Tiles.');
      return;
    }

    (Cesium as any).Ion.defaultAccessToken = '';

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    });

    // Hide everything that would clash with Photoreal tiles (per Google's official recipe).
    if (viewer.scene.globe) viewer.scene.globe.show = false;
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    if (viewer.scene.fog) viewer.scene.fog.enabled = false;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#001a18');

    // Sharper imagery for a single-circuit demo (lower SSE = more tile detail).
    // Lock the camera *before* the tileset loads so we never flash an unbounded view.
    applyBroadcastFraming(viewer);
    lockCamera(viewer);

    Cesium.Cesium3DTileset.fromUrl(
      `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_KEY}`,
      { showCreditsOnScreen: true },
    )
      .then((tileset) => {
        if (viewer.isDestroyed()) return;
        tileset.maximumScreenSpaceError = 8;
        tileset.dynamicScreenSpaceError = false;
        viewer.scene.primitives.add(tileset);
        tilesetRef.current = tileset;

        // Wait one render so the root tile has heights, then build clamped overlays.
        viewer.scene.requestRender();
        const buildOverlays = () => {
          if (viewer.isDestroyed()) return;
          // Clamp the racing line polyline to the photoreal mesh.
          const positions: Cesium.Cartesian3[] = IDEAL_LINE.map(([lat, lon]) => {
            const carto = Cesium.Cartographic.fromDegrees(lon, lat);
            // tileset.getHeight is available on Cesium >= 1.115 and is the
            // official Google Photoreal recipe for ground sampling.
            const h = (tileset as any).getHeight?.(carto, viewer.scene) ?? 0;
            return Cesium.Cartesian3.fromDegrees(lon, lat, h + SURFACE_LIFT_M);
          });

          polylineEntityRef.current = viewer.entities.add({
            polyline: {
              positions,
              width: 8,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.3,
                color: Cesium.Color.fromCssColorString('#35fdad'),
              }),
              clampToGround: false,
            },
          });

          // Start/finish marker — also clamped via explicit height
          const sfCarto = Cesium.Cartographic.fromDegrees(IDEAL_LINE[0][1], IDEAL_LINE[0][0]);
          const sfH = (tileset as any).getHeight?.(sfCarto, viewer.scene) ?? 0;
          viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(IDEAL_LINE[0][1], IDEAL_LINE[0][0], sfH + SURFACE_LIFT_M),
            point: {
              pixelSize: 14,
              color: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
            },
            label: {
              text: 'S/F',
              font: 'bold 13px monospace',
              fillColor: Cesium.Color.WHITE,
              pixelOffset: new Cesium.Cartesian2(14, -10),
              showBackground: true,
              backgroundColor: Cesium.Color.fromAlpha(Cesium.Color.BLACK, 0.7),
            },
          });

          // Re-assert framing after tileset loads (some tiles can nudge the camera)
          applyBroadcastFraming(viewer);
          setReady(true);
        };

        // Defer one frame so the root tile has a chance to register heights.
        // 250 ms is usually plenty for Photoreal at zoom level ~15.
        window.setTimeout(buildOverlays, 400);
      })
      .catch((e) => {
        if (viewer.isDestroyed()) return;
        console.error('Google Photoreal 3D tiles failed:', e);
        setError('Failed to load Google Photoreal 3D Tiles — check VITE_GOOGLE_MAPS_API_KEY, that Map Tiles API is enabled, and that the key has http://localhost:5175/* in its HTTP-referrer allowlist.');
      });

    viewerRef.current = viewer;

    return () => {
      try {
        viewer.destroy();
      } catch {
        // ignore
      }
      viewerRef.current = null;
      tilesetRef.current = null;
      carEntityRef.current = null;
      polylineEntityRef.current = null;
    };
  }, []);

  // Update car position with mesh-clamped height
  useEffect(() => {
    const viewer = viewerRef.current;
    const tileset = tilesetRef.current;
    if (!viewer || viewer.isDestroyed() || !tileset) return;
    const car = replayRecord ?? latest;
    if (!car || car.latitude == null || car.longitude == null) return;

    const carto = Cesium.Cartographic.fromDegrees(car.longitude, car.latitude);
    const h = (tileset as any).getHeight?.(carto, viewer.scene) ?? 0;
    const position = Cesium.Cartesian3.fromDegrees(car.longitude, car.latitude, h + SURFACE_LIFT_M);

    if (!carEntityRef.current) {
      carEntityRef.current = viewer.entities.add({
        name: 'Car',
        position,
        point: {
          pixelSize: 22,
          color: Cesium.Color.fromCssColorString('#fbbf24'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3,
        },
      });
    } else {
      carEntityRef.current.position = position as any;
    }
    viewer.scene.requestRender();
  }, [latest, replayRecord, ready]);

  const car = replayRecord ?? latest;

  return (
    <div className="relative rounded-lg overflow-hidden border border-white/10 h-full bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 z-20">
          <div className="max-w-md text-center space-y-3">
            <div className="text-[#fbbf24] font-mono text-sm font-bold tracking-widest">LIVE-1 · UNAVAILABLE</div>
            <p className="text-white/70 text-sm">{error}</p>
            <p className="text-white/40 text-xs">
              Enable the Map Tiles API in Google Cloud Console, create a key, and add{' '}
              <code className="bg-white/10 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY=…</code> to{' '}
              <code className="bg-white/10 px-1 rounded">frontend/.env.local</code>.
            </p>
          </div>
        </div>
      )}

      <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm rounded px-3 py-2 text-xs text-white space-y-0.5 font-mono pointer-events-none z-10">
        <div className="text-[#35fdad] font-bold tracking-widest text-[10px]">LIVE-1 · PHOTOREALISTIC 3D</div>
        <div className="text-white/60">Google Photoreal 3D Tiles · Cesium · locked broadcast cam</div>
        {car && (
          <>
            <div className="mt-1 text-white">
              Speed: <span className="text-[#fbbf24] font-bold">{Math.round(car.speed ?? 0)}</span> km/h
            </div>
            <div className="text-white/60">Course: {Math.round(car.course ?? 0)}°</div>
          </>
        )}
        {!ready && !error && (
          <div className="text-[#35fdad]/60 mt-1">Loading 3D tiles…</div>
        )}
      </div>
    </div>
  );
}
