import { useMemo } from 'react';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DeckGL } from '@deck.gl/react';
import { PathLayer, IconLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { MapViewState } from '@deck.gl/core';
import { IDEAL_LINE, TURN_LABELS } from '../../constants/zandvoort';
import type { TrackVizProps } from './TrackVizProps';

// Demo key — domain-restricted in MapTiler dashboard. Prefer VITE_MAPTILER_KEY in .env.local for local dev.
const MAPTILER_KEY = (import.meta.env.VITE_MAPTILER_KEY as string | undefined) || 'q5Le5vFsUiypcJkaTWMo';

const MAP_STYLE = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`
  : ({
      version: 8 as const,
      sources: {
        esri: {
          type: 'raster' as const,
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
        },
      },
      layers: [{ id: 'esri', type: 'raster' as const, source: 'esri' }],
    } as any);

// Fixed broadcast-camera view of Zandvoort. Locked — no pan/zoom/rotate.
// Heading/pitch tuned so the full 4.259 km circuit fills the frame at 16:9.
const FIXED_VIEW: MapViewState = {
  longitude: 4.5455,
  latitude: 52.3884,
  zoom: 15.25,
  pitch: 55,
  bearing: -15,
};

const BANKED_TURNS = new Set(['T3 (Hugenholtzbocht)', 'T14 (Arie Luyendyk)']);

// Build the corner-label dataset from the same TURN_LABELS the Leaflet
// overlay uses, so Live-3 reads identically to the existing live map.
const CORNER_LABELS = TURN_LABELS.map((t) => {
  const [lat, lon] = IDEAL_LINE[t.idx];
  return {
    name: t.name,
    banked: BANKED_TURNS.has(t.name),
    position: [lon, lat] as [number, number],
  };
});

const ideal3D = IDEAL_LINE.map(([lat, lon]) => [lon, lat] as [number, number]);

export function Live3DeckSatellite({ records, latest, replayRecord }: TrackVizProps) {
  const drivenSegments = useMemo(() => {
    if (records.length < 2) return [];
    const maxSpeed = Math.max(...records.map((r) => r.speed ?? 0), 1);
    return records.slice(0, -1).map((r, i) => {
      const next = records[i + 1];
      const avg = ((r.speed ?? 0) + (next.speed ?? 0)) / 2;
      const t = avg / maxSpeed;
      const color: [number, number, number, number] =
        t < 0.5
          ? [Math.round(50 + t * 2 * 100), Math.round(180 + t * 2 * 70), 255 - Math.round(t * 2 * 200), 220]
          : [255, Math.round(250 - (t - 0.5) * 2 * 220), Math.round(50 - (t - 0.5) * 2 * 50), 220];
      return {
        path: [
          [r.longitude, r.latitude],
          [next.longitude, next.latitude],
        ],
        color,
      };
    });
  }, [records]);

  const car = replayRecord ?? latest;

  const layers = [
    new PathLayer({
      id: 'ideal-line',
      data: [{ path: ideal3D }],
      getPath: (d: any) => d.path,
      getColor: [53, 253, 173, 220],
      getWidth: 4,
      widthMinPixels: 3,
      widthUnits: 'meters',
      capRounded: true,
      jointRounded: true,
    }),
    new PathLayer({
      id: 'driven',
      data: drivenSegments,
      getPath: (d: any) => d.path,
      getColor: (d: any) => d.color,
      getWidth: 7,
      widthMinPixels: 5,
      widthUnits: 'meters',
      capRounded: true,
      jointRounded: true,
    }),
    // Corner dots — banked turns highlighted purple to match the Leaflet overlay.
    new ScatterplotLayer({
      id: 'corner-dots',
      data: CORNER_LABELS,
      getPosition: (c: any) => c.position,
      getRadius: (c: any) => (c.banked ? 8 : 6),
      radiusMinPixels: 4,
      getFillColor: (c: any) =>
        c.banked ? [168, 85, 247, 230] : [0, 53, 48, 200],
      getLineColor: (c: any) =>
        c.banked ? [168, 85, 247, 255] : [248, 250, 252, 255],
      lineWidthMinPixels: 2,
      stroked: true,
    }),
    // Corner labels.
    new TextLayer({
      id: 'corner-labels',
      data: CORNER_LABELS,
      getPosition: (c: any) => c.position,
      getText: (c: any) => (c.banked ? `${c.name} · banked` : c.name),
      getSize: 11,
      getColor: [255, 255, 255, 255],
      getPixelOffset: [0, -14],
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontWeight: 600 as any,
      background: true,
      getBackgroundColor: [0, 0, 0, 180],
      backgroundPadding: [4, 2, 4, 2],
      outlineColor: [0, 0, 0, 200],
      outlineWidth: 2,
    } as any),
    ...(car
      ? [
          new ScatterplotLayer({
            id: 'car-glow',
            data: [car],
            getPosition: (r: any) => [r.longitude, r.latitude],
            getRadius: 30,
            radiusMinPixels: 12,
            getFillColor: [251, 191, 36, 120],
          }),
          new IconLayer({
            id: 'car',
            data: [car],
            getPosition: (r: any) => [r.longitude, r.latitude],
            getIcon: () => ({
              url:
                'data:image/svg+xml;utf8,' +
                encodeURIComponent(
                  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="%23fbbf24" stroke="white" stroke-width="3"/><circle cx="16" cy="16" r="4" fill="white"/></svg>`,
                ),
              width: 32,
              height: 32,
              anchorX: 16,
              anchorY: 16,
              mask: false,
            }),
            sizeUnits: 'pixels',
            getSize: 32,
          }),
        ]
      : []),
  ];

  return (
    <div className="relative rounded-lg overflow-hidden border border-white/10 h-full bg-black">
      <DeckGL
        initialViewState={FIXED_VIEW}
        viewState={FIXED_VIEW}
        controller={false}
        layers={layers}
      >
        <Map mapStyle={MAP_STYLE} reuseMaps attributionControl={false} />
      </DeckGL>

      <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm rounded px-3 py-2 text-xs text-white space-y-0.5 font-mono pointer-events-none">
        <div className="text-[#35fdad] font-bold tracking-widest text-[10px]">LIVE-3 · DECK.GL + SATELLITE</div>
        <div className="text-white/60">
          {MAPTILER_KEY ? 'MapTiler Hybrid' : 'Esri World Imagery (fallback)'} · locked broadcast cam
        </div>
        {car && (
          <>
            <div className="mt-1 text-white">
              Speed: <span className="text-[#fbbf24] font-bold">{Math.round(car.speed ?? 0)}</span> km/h
            </div>
            <div className="text-white/60">Course: {Math.round(car.course ?? 0)}°</div>
          </>
        )}
      </div>

      <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm rounded px-2 py-1 text-[10px] text-white/50 font-mono pointer-events-none">
        deck.gl · MapLibre · pitch {FIXED_VIEW.pitch}°
      </div>
    </div>
  );
}
