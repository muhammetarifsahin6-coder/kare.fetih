import React, { useCallback, useEffect, useRef, useState } from 'react';
import { animate, Variants } from 'framer-motion';
import { coordToIndex, getOrthogonalNeighbors, indexToCoord } from '../game/engine';
import {
  BOARD_THEME_DARK,
  BoardThemePalette,
  MatchState,
  PlayerColorKey,
} from '../game/types';
import { soundManager } from '../game/audio';

/**
 * Framer Motion variants for conquest shimmer aura and particle explosion effects using player color palettes
 */
export const conquestShimmerVariants: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: (colorHex: string) => ({
    opacity: [0, 1, 0.85, 0],
    scale: [0.85, 1.22, 1.08, 1],
    boxShadow: [
      `0 0 0px ${colorHex}`,
      `0 0 32px ${colorHex}, inset 0 0 16px ${colorHex}`,
      `0 0 14px ${colorHex}`,
      `0 0 0px ${colorHex}`,
    ],
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
  }),
};

export const conquestParticleVariants: Variants = {
  initial: { opacity: 1, scale: 1, x: 0, y: 0 },
  animate: (custom: { x: number; y: number; color: string; delay?: number }) => ({
    x: custom.x,
    y: custom.y,
    opacity: [1, 0.9, 0],
    scale: [1, 1.6, 0.2],
    backgroundColor: custom.color,
    transition: { duration: 0.62, delay: custom.delay || 0, ease: 'easeOut' },
  }),
};

export const conquestTileGlowVariants: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: (colors: { fill: string; light: string }) => ({
    opacity: [0, 0.95, 0.6, 0],
    scale: [0.9, 1.06, 1.02, 1],
    borderColor: [colors.light, colors.fill, 'transparent'],
    transition: { duration: 0.58, ease: 'easeOut' },
  }),
};

interface GameBoard2DProps {
  match: MatchState;
  isHumanTurn: boolean;
  isSelectionValid: boolean;
  themePalette?: BoardThemePalette;
  onUpdateSelection: (cells: number[]) => void;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  glowColor: string;
  alpha: number;
  size: number;
}

interface CellColorTransition {
  fromFill: string;
  toFill: string;
  toSecondary: string;
  progress: number;
}

const PARTICLE_POOL_SIZE = 96;

function parseHexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [37, 99, 235];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerpHexColor(hexA: string, hexB: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = parseHexToRgb(hexA);
  const [r2, g2, b2] = parseHexToRgb(hexB);
  const r = Math.round(r1 + (r2 - r1) * clamped);
  const g = Math.round(g1 + (g2 - g1) * clamped);
  const b = Math.round(b1 + (b2 - b1) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

export const GameBoard2D: React.FC<GameBoard2DProps> = ({
  match,
  isHumanTurn,
  isSelectionValid,
  themePalette = BOARD_THEME_DARK,
  onUpdateSelection,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Unified transform state for zoom & pan (Sections 12 & 13)
  const transformRef = useRef({
    scale: 1,
    panX: 0,
    panY: 0,
  });
  const [zoomPercent, setZoomPercent] = useState(100);
  const [interactionMode, setInteractionMode] = useState<'select' | 'pan'>('select');

  // Latest props in ref so gesture handlers never use stale state
  const latestRef = useRef({
    match,
    isHumanTurn,
    isSelectionValid,
    themePalette,
    interactionMode,
    onUpdateSelection,
  });
  useEffect(() => {
    latestRef.current = {
      match,
      isHumanTurn,
      isSelectionValid,
      themePalette,
      interactionMode,
      onUpdateSelection,
    };
  }, [match, isHumanTurn, isSelectionValid, themePalette, interactionMode, onUpdateSelection]);

  // Pooled particles for conquest juice using conquering player color palette (Zero-GC ring buffer)
  const particlesRef = useRef<Particle[]>(
    Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      color: '#FBBF24',
      glowColor: '#FEF08A',
      alpha: 0,
      size: 4,
    }))
  );

  // Smooth Framer Motion per-cell color transitions when squares change ownership
  const prevBoardSnapRef = useRef<{ matchId: string; board: number[] }>({
    matchId: match.matchId,
    board: [...match.board],
  });
  const cellTransitionsRef = useRef<Map<number, CellColorTransition>>(new Map());

  // Compute base board geometry inside the canvas (supports both square and rectangular boardCols x boardRows)
  const getBoardMetrics = useCallback(() => {
    const canvas = canvasRef.current;
    const width = canvas ? canvas.clientWidth : 600;
    const height = canvas ? canvas.clientHeight : 600;
    const padding = 16;
    const availW = Math.max(100, width - padding * 2);
    const availH = Math.max(100, height - padding * 2);

    const boardCols = match.boardCols || match.boardSize;
    const boardRows = match.boardRows || match.boardSize;

    const baseCellPx = Math.min(availW / boardCols, availH / boardRows);
    const { scale, panX, panY } = transformRef.current;
    const cellPx = baseCellPx * scale;
    const scaledBoardW = boardCols * cellPx;
    const scaledBoardH = boardRows * cellPx;

    const centerOriginX = (width - scaledBoardW) / 2 + panX;
    const centerOriginY = (height - scaledBoardH) / 2 + panY;

    return {
      width,
      height,
      boardCols,
      boardRows,
      baseCellPx,
      scaledBoardW,
      scaledBoardH,
      scaledBoardPx: Math.max(scaledBoardW, scaledBoardH),
      cellPx,
      originX: centerOriginX,
      originY: centerOriginY,
    };
  }, [match.boardSize, match.boardCols, match.boardRows]);

  const clampPan = useCallback(
    (nextScale: number, nextPanX: number, nextPanY: number) => {
      const canvas = canvasRef.current;
      const width = canvas ? canvas.clientWidth : 600;
      const height = canvas ? canvas.clientHeight : 600;
      const padding = 16;
      const boardCols = latestRef.current.match.boardCols || latestRef.current.match.boardSize;
      const boardRows = latestRef.current.match.boardRows || latestRef.current.match.boardSize;
      const baseCellPx = Math.min(
        Math.max(100, width - padding * 2) / boardCols,
        Math.max(100, height - padding * 2) / boardRows
      );
      const scaledW = boardCols * baseCellPx * nextScale;
      const scaledH = boardRows * baseCellPx * nextScale;

      if (nextScale <= 1.02) {
        return { scale: 1, panX: 0, panY: 0 };
      }

      const maxOffsetX = Math.max(0, (scaledW - width * 0.55) / 2);
      const maxOffsetY = Math.max(0, (scaledH - height * 0.55) / 2);

      return {
        scale: Math.max(1, Math.min(4, nextScale)),
        panX: Math.max(-maxOffsetX, Math.min(maxOffsetX, nextPanX)),
        panY: Math.max(-maxOffsetY, Math.min(maxOffsetY, nextPanY)),
      };
    },
    []
  );

  // Convert viewport clientX/clientY to board cell index using the exact same transform
  const clientToCellIndex = useCallback(
    (clientX: number, clientY: number): number | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;

      const { originX, originY, cellPx, boardCols, boardRows } = getBoardMetrics();
      const col = Math.floor((localX - originX) / cellPx);
      const row = Math.floor((localY - originY) / cellPx);

      if (row < 0 || row >= boardRows || col < 0 || col >= boardCols) {
        return null;
      }
      return coordToIndex(row, col, boardCols);
    },
    [getBoardMetrics]
  );

  // Draw the board on Canvas2D with dynamic Light/Dark theme palette, terrain obstacles/bridges, and Framer Motion transitions
  const drawBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth === 0 || cssHeight === 0) return;

    if (
      canvas.width !== Math.floor(cssWidth * dpr) ||
      canvas.height !== Math.floor(cssHeight * dpr)
    ) {
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const {
      match: curMatch,
      isHumanTurn: curHumanTurn,
      isSelectionValid: curValid,
      themePalette: palTheme,
    } = latestRef.current;
    const { originX, originY, scaledBoardW, scaledBoardH, cellPx, boardCols, boardRows } =
      getBoardMetrics();

    // 1. Crisp themed viewport background (Section 10: zero blur)
    ctx.fillStyle = palTheme.boardViewportBg;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // 2. Ornate double-beveled board frame with corner rivets (adapts to rectangular or square board)
    const framePad = 6;
    ctx.fillStyle = palTheme.gridLine;
    ctx.fillRect(
      originX - framePad,
      originY - framePad,
      scaledBoardW + framePad * 2,
      scaledBoardH + framePad * 2
    );

    ctx.strokeStyle = palTheme.boardFrameOuter;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(
      originX - framePad,
      originY - framePad,
      scaledBoardW + framePad * 2,
      scaledBoardH + framePad * 2
    );

    ctx.strokeStyle = palTheme.boardFrameInner;
    ctx.lineWidth = 1.25;
    ctx.strokeRect(originX - 2, originY - 2, scaledBoardW + 4, scaledBoardH + 4);

    // Corner metallic studs on the outer frame
    const studOffsets = [
      [originX - framePad + 3, originY - framePad + 3],
      [originX + scaledBoardW + framePad - 3, originY - framePad + 3],
      [originX - framePad + 3, originY + scaledBoardH + framePad - 3],
      [originX + scaledBoardW + framePad - 3, originY + scaledBoardH + framePad - 3],
    ];
    ctx.fillStyle = palTheme.boardFrameOuter;
    for (const [sx, sy] of studOffsets) {
      ctx.beginPath();
      ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Build lookup maps for players and selection
    const slotColorMap = new Map<
      number,
      {
        fill: string;
        fillSecondary: string;
        border: string;
        frontier: string;
        light: string;
      }
    >();
    const startingSet = new Set<number>();
    for (const p of curMatch.players) {
      const pal =
        palTheme.players[p.colorKey as PlayerColorKey] || palTheme.players.blue;
      slotColorMap.set(p.slotIndex, {
        fill: pal.fillHex,
        fillSecondary: pal.fillSecondaryHex,
        border: pal.borderHex,
        frontier: pal.frontierHex,
        light: pal.lightHex,
      });
      if (p.startingCells.length > 0) {
        startingSet.add(p.startingCells[0]);
      }
    }

    const selectedSet = new Set<number>(curMatch.selectedCells);
    const lastSelectedIdx =
      curMatch.selectedCells.length > 0
        ? curMatch.selectedCells[curMatch.selectedCells.length - 1]
        : -1;
    const activePlayer = curMatch.players.find((p) => p.id === curMatch.activePlayerId);
    const activeSlot = activePlayer ? activePlayer.slotIndex : -1;
    const showFrontierHints =
      curHumanTurn && curMatch.dice !== null && curMatch.remainingRights > 0;

    // 3. Draw all boardRows x boardCols cells with viewport culling
    const minCol = Math.max(0, Math.floor(-originX / cellPx));
    const maxCol = Math.min(boardCols - 1, Math.ceil((cssWidth - originX) / cellPx));
    const minRow = Math.max(0, Math.floor(-originY / cellPx));
    const maxRow = Math.min(boardRows - 1, Math.ceil((cssHeight - originY) / cellPx));

    const gap = cellPx >= 14 ? 1 : 0.5;
    const isLight = palTheme.mode === 'light';

    for (let r = minRow; r <= maxRow; r++) {
      const y = originY + r * cellPx;
      for (let c = minCol; c <= maxCol; c++) {
        const x = originX + c * cellPx;
        const idx = r * boardCols + c;
        const owner = curMatch.board[idx];
        const terrainType = curMatch.terrain ? curMatch.terrain[idx] : 0;
        const isSelected = selectedSet.has(idx);
        const tileW = cellPx - gap * 2;
        const tileH = cellPx - gap * 2;
        const tx = x + gap;
        const ty = y + gap;

        if (terrainType === 1) {
          // OBSTACLE TILE (River/Chasm or Mountain Crag)
          const nearBridgeOrChannel =
            Math.abs(c - Math.floor(boardCols / 2)) <= 2 ||
            Math.abs(r - Math.floor(boardRows / 2)) <= 2;

          if (nearBridgeOrChannel) {
            // Deep Strategic River / Water Channel
            ctx.fillStyle = isLight ? '#1E40AF' : '#0B253A';
            ctx.fillRect(tx, ty, tileW, tileH);
            if (cellPx >= 10) {
              ctx.strokeStyle = isLight ? 'rgba(147, 197, 253, 0.55)' : 'rgba(56, 189, 248, 0.35)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(tx + tileW * 0.2, ty + tileH * 0.38);
              ctx.lineTo(tx + tileW * 0.8, ty + tileH * 0.38);
              ctx.moveTo(tx + tileW * 0.25, ty + tileH * 0.68);
              ctx.lineTo(tx + tileW * 0.75, ty + tileH * 0.68);
              ctx.stroke();
            }
          } else {
            // Impassable Mountain Crag
            ctx.fillStyle = isLight ? '#57534E' : '#11131A';
            ctx.fillRect(tx, ty, tileW, tileH);
            if (cellPx >= 10) {
              ctx.fillStyle = isLight ? '#A8A29E' : '#374151';
              ctx.beginPath();
              ctx.moveTo(tx + tileW * 0.18, ty + tileH * 0.82);
              ctx.lineTo(tx + tileW * 0.5, ty + tileH * 0.2);
              ctx.lineTo(tx + tileW * 0.82, ty + tileH * 0.82);
              ctx.closePath();
              ctx.fill();
            }
          }
          continue;
        }

        if (owner === 0) {
          if (terrainType === 2) {
            // UNCLAIMED BRIDGE TILE
            ctx.fillStyle = isLight ? '#92400E' : '#5C3415';
            ctx.fillRect(tx, ty, tileW, tileH);
            if (cellPx >= 9) {
              // Bridge wooden/bronze deck planks & guardrails
              ctx.fillStyle = isLight ? '#F59E0B' : '#D97706';
              ctx.fillRect(tx, ty, tileW, Math.max(1.5, tileH * 0.14));
              ctx.fillRect(tx, ty + tileH - Math.max(1.5, tileH * 0.14), tileW, Math.max(1.5, tileH * 0.14));
              ctx.strokeStyle = isLight ? '#FEF3C7' : '#FDE68A';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(tx + tileW * 0.33, ty + 2);
              ctx.lineTo(tx + tileW * 0.33, ty + tileH - 2);
              ctx.moveTo(tx + tileW * 0.66, ty + 2);
              ctx.lineTo(tx + tileW * 0.66, ty + tileH - 2);
              ctx.stroke();
            }
          } else {
            // Sculpted stone/marble tile with checkerboard contrast
            ctx.fillStyle = (r + c) % 2 === 0 ? palTheme.emptyTileEven : palTheme.emptyTileOdd;
            ctx.fillRect(tx, ty, tileW, tileH);

            // Top-left bevel highlight on unclaimed stone
            if (cellPx >= 12) {
              ctx.fillStyle = palTheme.emptyTileBevel;
              ctx.fillRect(tx, ty, tileW, 1.2);
              ctx.fillRect(tx, ty, 1.2, tileH);
            }
          }

          // Subtle frontier hint if adjacent to active human player's territory after dice roll
          if (showFrontierHints && !isSelected && cellPx >= 10) {
            const touchesOwn = getOrthogonalNeighbors(idx, boardCols, boardRows).some(
              (nb) => curMatch.board[nb] === activeSlot
            );
            if (touchesOwn) {
              ctx.strokeStyle =
                palTheme.mode === 'light'
                  ? 'rgba(180, 83, 9, 0.42)'
                  : 'rgba(251, 191, 36, 0.36)';
              ctx.lineWidth = 1;
              ctx.strokeRect(tx + 1, ty + 1, tileW - 2, tileH - 2);
            }
          }
        } else {
          const pal = slotColorMap.get(owner);
          const anim = cellTransitionsRef.current.get(idx);

          let fillStyle = pal ? pal.fill : '#2563EB';
          let secondaryStyle = pal ? pal.fillSecondary : '#1D4ED8';

          // Apply smooth Framer Motion color interpolation when recently conquered
          if (anim && anim.progress < 1) {
            const p = anim.progress;
            if (p < 0.38) {
              // Phase 1: blend from old color into golden conquest flash
              fillStyle = lerpHexColor(anim.fromFill, '#FACC15', p / 0.38);
            } else {
              // Phase 2: settle smoothly from golden flash into new owner's color
              fillStyle = lerpHexColor('#FACC15', anim.toFill, (p - 0.38) / 0.62);
            }
            secondaryStyle = lerpHexColor(anim.fromFill, anim.toSecondary, p);
          }

          ctx.fillStyle = fillStyle;
          ctx.fillRect(tx, ty, tileW, tileH);

          if (cellPx >= 10 && pal) {
            // Lower half subtle shade for 3D bevel depth
            ctx.fillStyle = secondaryStyle;
            ctx.fillRect(tx, ty + tileH * 0.58, tileW, tileH * 0.42);

            // Top specular rim
            ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
            ctx.fillRect(tx + 0.5, ty + 0.5, tileW - 1, Math.max(1.2, tileH * 0.14));

            // If this owned square is a bridge, draw golden bridge rails over the kingdom color
            if (terrainType === 2) {
              ctx.fillStyle = '#FBBF24';
              ctx.fillRect(tx, ty, tileW, Math.max(1.5, tileH * 0.13));
              ctx.fillRect(tx, ty + tileH - Math.max(1.5, tileH * 0.13), tileW, Math.max(1.5, tileH * 0.13));
            }

            // Contiguous Kingdom Frontier Borders: draw crisp outer border edges where territory meets another owner
            ctx.strokeStyle = owner === activeSlot ? pal.frontier : pal.border;
            ctx.lineWidth =
              owner === activeSlot ? Math.max(1.8, cellPx * 0.11) : Math.max(1.2, cellPx * 0.07);
            ctx.beginPath();
            // Top edge
            if (r === 0 || curMatch.board[(r - 1) * boardCols + c] !== owner) {
              ctx.moveTo(tx, ty + 0.75);
              ctx.lineTo(tx + tileW, ty + 0.75);
            }
            // Bottom edge
            if (r === boardRows - 1 || curMatch.board[(r + 1) * boardCols + c] !== owner) {
              ctx.moveTo(tx, ty + tileH - 0.75);
              ctx.lineTo(tx + tileW, ty + tileH - 0.75);
            }
            // Left edge
            if (c === 0 || curMatch.board[r * boardCols + (c - 1)] !== owner) {
              ctx.moveTo(tx + 0.75, ty);
              ctx.lineTo(tx + 0.75, ty + tileH);
            }
            // Right edge
            if (c === boardCols - 1 || curMatch.board[r * boardCols + (c + 1)] !== owner) {
              ctx.moveTo(tx + tileW - 0.75, ty);
              ctx.lineTo(tx + tileW - 0.75, ty + tileH);
            }
            ctx.stroke();
          }

          // Animated conqueror palette shimmer overlay & wave rim during transition
          if (anim && anim.progress < 1) {
            const pulseAlpha = Math.sin(anim.progress * Math.PI);
            
            // 1. Shimmer fill aura using conqueror's light accent color
            if (pal) {
              ctx.fillStyle = pal.light;
              ctx.globalAlpha = pulseAlpha * 0.42;
              ctx.fillRect(tx, ty, tileW, tileH);
              ctx.globalAlpha = 1;
            }

            // 2. Wave rim in conqueror's frontier color
            ctx.strokeStyle = pal ? pal.frontier : '#FEF08A';
            ctx.lineWidth = Math.max(2.2, cellPx * 0.18);
            ctx.strokeRect(tx + 0.5, ty + 0.5, Math.max(1, tileW - 1), Math.max(1, tileH - 1));

            // 3. Diamond sparkle star at cell center during peak pulse (0.2 < progress < 0.75)
            if (anim.progress > 0.2 && anim.progress < 0.75 && cellPx >= 12 && pal) {
              const cx = tx + tileW / 2;
              const cy = ty + tileH / 2;
              const starSz = Math.max(2.5, cellPx * 0.22) * pulseAlpha;
              ctx.fillStyle = '#FFFFFF';
              ctx.beginPath();
              ctx.moveTo(cx, cy - starSz);
              ctx.lineTo(cx + starSz * 0.4, cy);
              ctx.lineTo(cx, cy + starSz);
              ctx.lineTo(cx - starSz * 0.4, cy);
              ctx.closePath();
              ctx.fill();
            }
          }

          // Royal Citadel Crown / Turret emblem on starting corner anchor
          if (startingSet.has(idx) && cellPx >= 9) {
            const cx = x + cellPx / 2;
            const cy = y + cellPx / 2;
            const sz = Math.max(3, cellPx * 0.28);
            ctx.fillStyle = '#FFFBEB';
            ctx.strokeStyle = '#78350F';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx - sz, cy + sz * 0.75);
            ctx.lineTo(cx - sz, cy - sz * 0.55);
            ctx.lineTo(cx - sz * 0.45, cy - sz * 0.05);
            ctx.lineTo(cx, cy - sz * 0.85);
            ctx.lineTo(cx + sz * 0.45, cy - sz * 0.05);
            ctx.lineTo(cx + sz, cy - sz * 0.55);
            ctx.lineTo(cx + sz, cy + sz * 0.75);
            ctx.closePath();
            ctx.fill();
            if (cellPx >= 13) {
              ctx.stroke();
            }
          }
        }

        // 4. Selection highlight overlay with tactical diagonal hatching (Section 6.4 & 16)
        if (isSelected) {
          ctx.fillStyle = curValid
            ? palTheme.validSelectionFill
            : palTheme.invalidSelectionFill;
          ctx.fillRect(tx, ty, tileW, tileH);

          if (cellPx >= 11) {
            ctx.strokeStyle = curValid
              ? 'rgba(254, 240, 138, 0.45)'
              : 'rgba(254, 202, 202, 0.45)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tx + 2, ty + tileH - 2);
            ctx.lineTo(tx + tileW - 2, ty + 2);
            ctx.stroke();
          }

          ctx.strokeStyle = curValid
            ? palTheme.validSelectionStroke
            : palTheme.invalidSelectionStroke;
          ctx.lineWidth = Math.max(1.6, cellPx * 0.13);
          ctx.strokeRect(
            tx + 1,
            ty + 1,
            Math.max(1, tileW - 2),
            Math.max(1, tileH - 2)
          );

          if (idx === lastSelectedIdx && cellPx >= 13) {
            ctx.fillStyle = curValid ? '#14532D' : '#7F1D1D';
            ctx.fillRect(tx + 2, ty + 2, Math.min(tileW - 4, 15), Math.min(tileH - 4, 12));
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `bold ${Math.max(8, Math.min(10, Math.floor(cellPx * 0.48)))}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
              String(curMatch.selectedCells.length),
              tx + Math.min(tileW, 19) / 2,
              ty + Math.min(tileH, 16) / 2
            );
          }
        }
      }
    }

    // 5. Render active conquest shimmer particles using conqueror's color palette
    for (const p of particlesRef.current) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.alpha);
      
      // Outer soft radial glow using player's glow color
      ctx.fillStyle = p.glowColor;
      ctx.fillRect(p.x - (p.size * 1.5) / 2, p.y - (p.size * 1.5) / 2, p.size * 1.5, p.size * 1.5);

      // Core particle using player's palette color
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }, [getBoardMetrics]);

  // Trigger Framer Motion smooth color transition & conqueror palette particle burst whenever cells change ownership
  useEffect(() => {
    const prevSnap = prevBoardSnapRef.current;
    if (prevSnap.matchId !== match.matchId || prevSnap.board.length !== match.board.length) {
      prevBoardSnapRef.current = { matchId: match.matchId, board: [...match.board] };
      cellTransitionsRef.current.clear();
      drawBoard();
      return;
    }

    const changedIndices: number[] = [];
    for (let i = 0; i < match.board.length; i++) {
      if (match.board[i] !== prevSnap.board[i] && match.board[i] > 0) {
        changedIndices.push(i);
      }
    }

    if (changedIndices.length === 0) {
      drawBoard();
      return;
    }

    const boardCols = match.boardCols || match.boardSize;
    const slotPalettes = new Map<
      number,
      { fillHex: string; fillSecondaryHex: string; borderHex: string; frontierHex: string; lightHex: string }
    >();
    for (const p of match.players) {
      const pal = themePalette.players[p.colorKey] || themePalette.players.blue;
      slotPalettes.set(p.slotIndex, pal);
    }

    for (const idx of changedIndices) {
      const oldOwner = prevSnap.board[idx];
      const newOwner = match.board[idx];
      const r = Math.floor(idx / boardCols);
      const c = idx % boardCols;
      const fromFill =
        oldOwner > 0
          ? slotPalettes.get(oldOwner)?.fillHex || themePalette.emptyTileEven
          : (r + c) % 2 === 0
          ? themePalette.emptyTileEven
          : themePalette.emptyTileOdd;
      const newPal = slotPalettes.get(newOwner) || themePalette.players.blue;
      cellTransitionsRef.current.set(idx, {
        fromFill,
        toFill: newPal.fillHex,
        toSecondary: newPal.fillSecondaryHex,
        progress: 0,
      });
    }

    prevBoardSnapRef.current = { matchId: match.matchId, board: [...match.board] };

    // Spawn rich multi-color particles using conquering player's specific color palette across conquered cells
    const canvas = canvasRef.current;
    if (canvas && changedIndices.length > 0) {
      const { originX, originY, cellPx } = getBoardMetrics();
      const ownerSlot = match.board[changedIndices[0]];
      const pal = slotPalettes.get(ownerSlot) || themePalette.players.gold;

      // Conqueror palette color swatches for particle shimmer
      const conquerorColors = [
        pal.fillHex,
        pal.lightHex,
        pal.frontierHex,
        pal.borderHex,
        '#FDE68A',
        '#FACC15',
      ];

      let spawned = 0;
      const maxToSpawn = Math.min(PARTICLE_POOL_SIZE, Math.max(28, changedIndices.length * 6));

      // 1. Per-tile particle eruptions
      for (const idx of changedIndices) {
        if (spawned >= maxToSpawn) break;
        const { row, col } = indexToCoord(idx, boardCols);
        const tileCx = originX + (col + 0.5) * cellPx;
        const tileCy = originY + (row + 0.5) * cellPx;

        const countForThisTile = Math.max(3, Math.floor(maxToSpawn / changedIndices.length));
        for (let k = 0; k < countForThisTile; k++) {
          if (spawned >= PARTICLE_POOL_SIZE) break;
          const pt = particlesRef.current[spawned];
          const angle = Math.random() * Math.PI * 2;
          const speed = 1.2 + Math.random() * 3.6;
          pt.active = true;
          pt.x = tileCx + (Math.random() - 0.5) * cellPx * 0.4;
          pt.y = tileCy + (Math.random() - 0.5) * cellPx * 0.4;
          pt.vx = Math.cos(angle) * speed;
          pt.vy = Math.sin(angle) * speed - 0.6; // Light upward float
          pt.color = conquerorColors[spawned % conquerorColors.length];
          pt.glowColor = pal.lightHex;
          pt.alpha = 1;
          pt.size = 3.2 + Math.random() * 3.5;
          spawned++;
        }
      }

      // 2. Group centroid burst for overall area celebration
      let sumX = 0;
      let sumY = 0;
      for (const idx of changedIndices) {
        const { row, col } = indexToCoord(idx, boardCols);
        sumX += originX + (col + 0.5) * cellPx;
        sumY += originY + (row + 0.5) * cellPx;
      }
      const cx = sumX / changedIndices.length;
      const cy = sumY / changedIndices.length;

      while (spawned < maxToSpawn && spawned < PARTICLE_POOL_SIZE) {
        const pt = particlesRef.current[spawned];
        const angle = (Math.PI * 2 * spawned) / 16 + Math.random() * 0.3;
        const speed = 2.0 + Math.random() * 4.2;
        pt.active = true;
        pt.x = cx;
        pt.y = cy;
        pt.vx = Math.cos(angle) * speed;
        pt.vy = Math.sin(angle) * speed - 0.8;
        pt.color = conquerorColors[spawned % conquerorColors.length];
        pt.glowColor = pal.frontierHex;
        pt.alpha = 1;
        pt.size = 4.0 + Math.random() * 3.8;
        spawned++;
      }
    }

    // Drive smooth color interpolation & particle physics with Framer Motion's `animate`
    const controls = animate(0, 1, {
      duration: 0.58,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        for (const idx of changedIndices) {
          const entry = cellTransitionsRef.current.get(idx);
          if (entry) {
            entry.progress = latest;
          }
        }
        for (const p of particlesRef.current) {
          if (p.active) {
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.96; // Air drag
            p.vy *= 0.96;
            p.alpha = Math.max(0, p.alpha - 0.038);
            if (p.alpha <= 0) p.active = false;
          }
        }
        drawBoard();
      },
      onComplete: () => {
        for (const idx of changedIndices) {
          cellTransitionsRef.current.delete(idx);
        }
        drawBoard();
      },
    });

    return () => {
      controls.stop();
    };
  }, [match.board, match.matchId, match.boardCols, match.boardSize, match.players, themePalette, getBoardMetrics, drawBoard]);

  // Redraw when selection, theme, or zoom changes
  useEffect(() => {
    drawBoard();
  }, [match.selectedCells, isSelectionValid, themePalette, zoomPercent, drawBoard]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      drawBoard();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [drawBoard]);

  // Orthogonal line interpolation between two cells so fast drag never leaves gaps
  const getOrthogonalCellPath = (fromIdx: number, toIdx: number, boardCols: number): number[] => {
    const a = indexToCoord(fromIdx, boardCols);
    const b = indexToCoord(toIdx, boardCols);
    const result: number[] = [fromIdx];
    let r = a.row;
    let c = a.col;
    while (r !== b.row || c !== b.col) {
      if (Math.abs(b.row - r) >= Math.abs(b.col - c)) {
        r += b.row > r ? 1 : -1;
      } else {
        c += b.col > c ? 1 : -1;
      }
      result.push(coordToIndex(r, c, boardCols));
    }
    return result;
  };

  // Multi-touch Pinch-to-Zoom, 1-Finger Pan, and Drag Selection (Sections 12 & 13)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isPointerDown = false;
    let gestureType: 'none' | 'select' | 'deselect' | 'pan' | 'pinch' = 'none';
    let lastCellIdx: number | null = null;
    let workingSelection = new Set<number>();
    let panStartX = 0;
    let panStartY = 0;
    let initialPanX = 0;
    let initialPanY = 0;

    // Pinch state
    let initialPinchDist = 0;
    let initialPinchScale = 1;
    let pinchMidX = 0;
    let pinchMidY = 0;

    const getTouchDistance = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        // 2-finger pinch-to-zoom immediately overrides any single-finger selection (Section 12)
        e.preventDefault();
        gestureType = 'pinch';
        isPointerDown = false;
        lastCellIdx = null;
        initialPinchDist = Math.max(10, getTouchDistance(e.touches[0], e.touches[1]));
        initialPinchScale = transformRef.current.scale;
        const rect = canvas.getBoundingClientRect();
        pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        initialPanX = transformRef.current.panX;
        initialPanY = transformRef.current.panY;
        return;
      }

      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const { match: curMatch, isHumanTurn: curHuman, interactionMode: curMode } =
          latestRef.current;

        if (curMode === 'pan' || !curHuman || !curMatch.dice) {
          gestureType = 'pan';
          isPointerDown = true;
          panStartX = touch.clientX;
          panStartY = touch.clientY;
          initialPanX = transformRef.current.panX;
          initialPanY = transformRef.current.panY;
          return;
        }

        const cellIdx = clientToCellIndex(touch.clientX, touch.clientY);
        if (cellIdx === null) return;

        const activePlayer = curMatch.players.find((p) => p.id === curMatch.activePlayerId);
        if (!activePlayer) return;

        // If user touches their own already-owned square or an obstacle while zoomed in, pan the board smoothly
        if (
          curMatch.board[cellIdx] === activePlayer.slotIndex ||
          (curMatch.terrain && curMatch.terrain[cellIdx] === 1)
        ) {
          gestureType = 'pan';
          isPointerDown = true;
          panStartX = touch.clientX;
          panStartY = touch.clientY;
          initialPanX = transformRef.current.panX;
          initialPanY = transformRef.current.panY;
          return;
        }

        e.preventDefault();
        isPointerDown = true;
        lastCellIdx = cellIdx;
        workingSelection = new Set<number>(curMatch.selectedCells);

        if (workingSelection.has(cellIdx)) {
          gestureType = 'deselect';
          workingSelection.delete(cellIdx);
        } else {
          gestureType = 'select';
          workingSelection.add(cellIdx);
        }
        latestRef.current.onUpdateSelection(Array.from(workingSelection));
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2 || gestureType === 'pinch') {
        if (e.touches.length >= 2) {
          e.preventDefault();
          const newDist = Math.max(10, getTouchDistance(e.touches[0], e.touches[1]));
          const ratio = newDist / initialPinchDist;
          const rawNextScale = Math.max(1, Math.min(4, initialPinchScale * ratio));

          const rect = canvas.getBoundingClientRect();
          const curMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          const curMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

          const scaleRatio = rawNextScale / initialPinchScale;
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;

          // Keep the pinched midpoint anchored on screen + follow two-finger pan
          const nextPanX =
            (pinchMidX - centerX) * (1 - scaleRatio) +
            initialPanX * scaleRatio +
            (curMidX - pinchMidX);
          const nextPanY =
            (pinchMidY - centerY) * (1 - scaleRatio) +
            initialPanY * scaleRatio +
            (curMidY - pinchMidY);

          transformRef.current = clampPan(rawNextScale, nextPanX, nextPanY);
          setZoomPercent(Math.round(transformRef.current.scale * 100));
          drawBoard();
        }
        return;
      }

      if (!isPointerDown || e.touches.length !== 1) return;
      const touch = e.touches[0];

      if (gestureType === 'pan') {
        if (transformRef.current.scale <= 1.02) return;
        e.preventDefault();
        const dx = touch.clientX - panStartX;
        const dy = touch.clientY - panStartY;
        transformRef.current = clampPan(
          transformRef.current.scale,
          initialPanX + dx,
          initialPanY + dy
        );
        drawBoard();
        return;
      }

      if (gestureType === 'select' || gestureType === 'deselect') {
        e.preventDefault();
        const cellIdx = clientToCellIndex(touch.clientX, touch.clientY);
        if (cellIdx === null || cellIdx === lastCellIdx) return;

        const { match: curMatch } = latestRef.current;
        const activePlayer = curMatch.players.find((p) => p.id === curMatch.activePlayerId);
        if (!activePlayer) return;

        const boardCols = curMatch.boardCols || curMatch.boardSize;
        const pathCells =
          lastCellIdx !== null
            ? getOrthogonalCellPath(lastCellIdx, cellIdx, boardCols)
            : [cellIdx];
        lastCellIdx = cellIdx;

        let changed = false;
        for (const c of pathCells) {
          if (
            curMatch.board[c] === activePlayer.slotIndex ||
            (curMatch.terrain && curMatch.terrain[c] === 1)
          ) {
            continue;
          }
          if (gestureType === 'select' && !workingSelection.has(c)) {
            workingSelection.add(c);
            changed = true;
          } else if (gestureType === 'deselect' && workingSelection.has(c)) {
            workingSelection.delete(c);
            changed = true;
          }
        }
        if (changed) {
          latestRef.current.onUpdateSelection(Array.from(workingSelection));
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        isPointerDown = false;
        gestureType = 'none';
        lastCellIdx = null;
      }
    };

    // Mouse handlers for desktop / Playwright verification
    const handleMouseDown = (e: MouseEvent) => {
      const { match: curMatch, isHumanTurn: curHuman, interactionMode: curMode } =
        latestRef.current;

      if (e.button === 1 || e.button === 2 || curMode === 'pan' || !curHuman || !curMatch.dice) {
        gestureType = 'pan';
        isPointerDown = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        initialPanX = transformRef.current.panX;
        initialPanY = transformRef.current.panY;
        return;
      }

      const cellIdx = clientToCellIndex(e.clientX, e.clientY);
      if (cellIdx === null) return;

      const activePlayer = curMatch.players.find((p) => p.id === curMatch.activePlayerId);
      if (!activePlayer) return;

      if (
        curMatch.board[cellIdx] === activePlayer.slotIndex ||
        (curMatch.terrain && curMatch.terrain[cellIdx] === 1)
      ) {
        gestureType = 'pan';
        isPointerDown = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        initialPanX = transformRef.current.panX;
        initialPanY = transformRef.current.panY;
        return;
      }

      isPointerDown = true;
      lastCellIdx = cellIdx;
      workingSelection = new Set<number>(curMatch.selectedCells);

      if (workingSelection.has(cellIdx)) {
        gestureType = 'deselect';
        workingSelection.delete(cellIdx);
      } else {
        gestureType = 'select';
        workingSelection.add(cellIdx);
      }
      latestRef.current.onUpdateSelection(Array.from(workingSelection));
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPointerDown) return;

      if (gestureType === 'pan') {
        if (transformRef.current.scale <= 1.02) return;
        const dx = e.clientX - panStartX;
        const dy = e.clientY - panStartY;
        transformRef.current = clampPan(
          transformRef.current.scale,
          initialPanX + dx,
          initialPanY + dy
        );
        drawBoard();
        return;
      }

      if (gestureType === 'select' || gestureType === 'deselect') {
        const cellIdx = clientToCellIndex(e.clientX, e.clientY);
        if (cellIdx === null || cellIdx === lastCellIdx) return;

        const { match: curMatch } = latestRef.current;
        const activePlayer = curMatch.players.find((p) => p.id === curMatch.activePlayerId);
        if (!activePlayer) return;

        const boardCols = curMatch.boardCols || curMatch.boardSize;
        const pathCells =
          lastCellIdx !== null
            ? getOrthogonalCellPath(lastCellIdx, cellIdx, boardCols)
            : [cellIdx];
        lastCellIdx = cellIdx;

        let changed = false;
        for (const c of pathCells) {
          if (
            curMatch.board[c] === activePlayer.slotIndex ||
            (curMatch.terrain && curMatch.terrain[c] === 1)
          ) {
            continue;
          }
          if (gestureType === 'select' && !workingSelection.has(c)) {
            workingSelection.add(c);
            changed = true;
          } else if (gestureType === 'deselect' && workingSelection.has(c)) {
            workingSelection.delete(c);
            changed = true;
          }
        }
        if (changed) {
          latestRef.current.onUpdateSelection(Array.from(workingSelection));
        }
      }
    };

    const handleMouseUp = () => {
      isPointerDown = false;
      gestureType = 'none';
      lastCellIdx = null;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.15 : 0.87;
      const nextScale = Math.max(1, Math.min(4, transformRef.current.scale * delta));
      transformRef.current = clampPan(
        nextScale,
        transformRef.current.panX,
        transformRef.current.panY
      );
      setZoomPercent(Math.round(transformRef.current.scale * 100));
      drawBoard();
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchcancel', handleTouchEnd);
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [clampPan, clientToCellIndex, drawBoard]);

  const handleZoomBy = (factor: number) => {
    const nextScale = Math.max(1, Math.min(4, transformRef.current.scale * factor));
    transformRef.current = clampPan(
      nextScale,
      transformRef.current.panX,
      transformRef.current.panY
    );
    setZoomPercent(Math.round(transformRef.current.scale * 100));
    drawBoard();
  };

  const handleResetView = () => {
    transformRef.current = { scale: 1, panX: 0, panY: 0 };
    setZoomPercent(100);
    setInteractionMode('select');
    drawBoard();
  };

  // Expose helper on window for deterministic automated coordinate lookups during verification
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__kareFetihGetCellScreenCoords = (
      row: number,
      col: number
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const { originX, originY, cellPx } = getBoardMetrics();
      return {
        x: Math.round(rect.left + originX + (col + 0.5) * cellPx),
        y: Math.round(rect.top + originY + (row + 0.5) * cellPx),
      };
    };
  }, [getBoardMetrics]);

  const isLight = themePalette.mode === 'light';

  return (
    <div
      className={`w-full h-full select-none overflow-hidden flex flex-row items-stretch transition-colors ${
        isLight ? 'bg-[#DDD3BC]' : 'bg-[#0E121A]'
      }`}
    >
      {/* Dedicated Left Tactical Gesture Strip (Zero overlap with board squares) */}
      <div
        className={`w-13 h-full shrink-0 border-r flex flex-col items-center justify-center gap-1.5 py-2 px-1 transition-colors pl-safe pt-safe pb-safe ${
          isLight
            ? 'bg-[#EAE2CE] border-[#B89758]'
            : 'bg-[#151820] border-[#2C261C]'
        }`}
        style={{
          paddingLeft: 'max(0.25rem, env(safe-area-inset-left))',
          paddingTop: 'max(0.25rem, env(safe-area-inset-top))',
          paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))',
        }}
      >
        <button
          type="button"
          data-testid="mode-select-btn"
          onClick={() => {
            soundManager.vibrate(10);
            setInteractionMode('select');
          }}
          aria-label="Kare Seçim Modu"
          className={`w-full min-h-[36px] py-1.5 px-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer active:scale-95 flex items-center justify-center ${
            interactionMode === 'select'
              ? 'bg-[#C89B3C] text-[#111318] shadow-xs'
              : isLight
              ? 'bg-[#DCD2BA] text-[#44403C] hover:bg-[#CEC2A6]'
              : 'bg-[#202430] text-[#D4CFC7] hover:bg-[#2A2F3D]'
          }`}
        >
          Seç
        </button>
        <button
          type="button"
          data-testid="mode-pan-btn"
          onClick={() => {
            soundManager.vibrate(10);
            setInteractionMode('pan');
          }}
          aria-label="Tahta Kaydırma Modu"
          className={`w-full min-h-[36px] py-1.5 px-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer active:scale-95 flex items-center justify-center ${
            interactionMode === 'pan'
              ? 'bg-[#C89B3C] text-[#111318] shadow-xs'
              : isLight
              ? 'bg-[#DCD2BA] text-[#44403C] hover:bg-[#CEC2A6]'
              : 'bg-[#202430] text-[#D4CFC7] hover:bg-[#2A2F3D]'
          }`}
        >
          Kaydır
        </button>
        <div
          className={`w-7 h-px my-0.5 ${
            isLight ? 'bg-[#C5B99E]' : 'bg-[#2E3342]'
          }`}
        />
        <button
          type="button"
          data-testid="zoom-in-btn"
          onClick={() => {
            soundManager.vibrate(10);
            handleZoomBy(1.25);
          }}
          aria-label="Yakınlaştır"
          className={`w-10 min-h-[36px] flex items-center justify-center text-sm font-bold rounded-lg cursor-pointer active:scale-95 transition-all ${
            isLight
              ? 'text-[#1C1917] bg-[#DCD2BA] hover:bg-[#CEC2A6]'
              : 'text-[#E5E0D8] bg-[#222631] hover:bg-[#2E3342]'
          }`}
        >
          +
        </button>
        <span
          data-testid="zoom-percent-readout"
          className={`text-[10px] font-mono tabular-nums text-center font-semibold ${
            isLight ? 'text-[#44403C]' : 'text-[#D4CFC7]'
          }`}
        >
          {zoomPercent}%
        </span>
        <button
          type="button"
          data-testid="zoom-out-btn"
          onClick={() => {
            soundManager.vibrate(10);
            handleZoomBy(0.8);
          }}
          aria-label="Uzaklaştır"
          className={`w-10 min-h-[36px] flex items-center justify-center text-sm font-bold rounded-lg cursor-pointer active:scale-95 transition-all ${
            isLight
              ? 'text-[#1C1917] bg-[#DCD2BA] hover:bg-[#CEC2A6]'
              : 'text-[#E5E0D8] bg-[#222631] hover:bg-[#2E3342]'
          }`}
        >
          −
        </button>
        {zoomPercent !== 100 && (
          <button
            type="button"
            data-testid="zoom-reset-btn"
            onClick={() => {
              soundManager.vibrate(10);
              handleResetView();
            }}
            aria-label="Görünümü Sıfırla"
            className="w-full min-h-[30px] py-1 text-[9px] font-bold text-[#FBBF24] bg-[#242018] hover:bg-[#332C1E] active:scale-95 rounded-lg transition-all cursor-pointer flex items-center justify-center"
          >
            1:1
          </button>
        )}
      </div>

      {/* Main Board Canvas Container */}
      <div
        ref={containerRef}
        className={`relative flex-1 h-full overflow-hidden flex items-center justify-center ${
          isLight ? 'bg-[#DDD3BC]' : 'bg-[#0E121A]'
        }`}
      >
        <canvas
          ref={canvasRef}
          data-testid="karefetih-board-canvas"
          aria-label={`KareFetih ${match.boardSize}x${match.boardSize} Strateji Tahtası`}
          className="w-full h-full block touch-none cursor-crosshair"
        />
      </div>
    </div>
  );
};
