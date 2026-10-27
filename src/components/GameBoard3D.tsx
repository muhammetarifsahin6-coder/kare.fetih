import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { indexToCoord } from '../game/engine';
import {
  BOARD_THEME_DARK,
  BoardThemePalette,
  MatchState,
  PLAYER_PALETTES,
  PlayerColorKey,
} from '../game/types';

interface GameBoard3DProps {
  match: MatchState;
  isHumanTurn: boolean;
  isSelectionValid: boolean;
  themePalette?: BoardThemePalette;
  onUpdateSelection: (cells: number[]) => void;
}

// Pre-allocated reusable math helpers outside render loop (Zero-GC requirement)
const _dummyMatrix = new THREE.Matrix4();
const _dummyPos = new THREE.Vector3();
const _dummyScale = new THREE.Vector3();
const _dummyQuat = new THREE.Quaternion();
const _dummyColor = new THREE.Color();

/**
 * Builds a composite 7-part procedural Citadel Stronghold mesh (`THREE.Group`)
 * grounded at bottom-center (y = 0) with varied roughness and metalness.
 */
function buildProceduralCitadelGroup(primaryHex: string, accentHex: string): THREE.Group {
  const group = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(primaryHex),
    roughness: 0.72,
    metalness: 0.15,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.35,
    metalness: 0.65,
  });
  const bronzeMat = new THREE.MeshStandardMaterial({
    color: 0xc89b3c,
    roughness: 0.25,
    metalness: 0.88,
  });

  // 1. Soft radial contact shadow disc flush with ground
  const shadowGeo = new THREE.CircleGeometry(0.95, 20);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.position.y = 0.015;
  group.add(shadowDisc);

  // 2. Primary Silhouette: Octagonal Stone Plinth Base
  const plinthGeo = new THREE.CylinderGeometry(0.65, 0.78, 0.35, 8);
  const plinth = new THREE.Mesh(plinthGeo, stoneMat);
  plinth.position.y = 0.175;
  group.add(plinth);

  // 3. Secondary Read: Tapered Keep Tower Body
  const towerGeo = new THREE.CylinderGeometry(0.45, 0.56, 0.9, 8);
  const tower = new THREE.Mesh(towerGeo, stoneMat);
  tower.position.y = 0.8;
  group.add(tower);

  // 4. Secondary Read: Bronze Battlement Crown Ring
  const crownGeo = new THREE.CylinderGeometry(0.54, 0.48, 0.18, 8);
  const crown = new THREE.Mesh(crownGeo, bronzeMat);
  crown.position.y = 1.32;
  group.add(crown);

  // 5. Secondary Read: Conical Citadel Spire Roof
  const spireGeo = new THREE.ConeGeometry(0.52, 0.55, 8);
  const spire = new THREE.Mesh(spireGeo, roofMat);
  spire.position.y = 1.68;
  group.add(spire);

  // 6. Accent Detail: Flagstaff Pole
  const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.65, 6);
  const pole = new THREE.Mesh(poleGeo, bronzeMat);
  pole.position.y = 2.15;
  group.add(pole);

  // 7. Accent Detail: Sovereign Banner Pennant
  const bannerGeo = new THREE.BoxGeometry(0.38, 0.2, 0.03);
  const banner = new THREE.Mesh(bannerGeo, roofMat);
  banner.position.set(0.19, 2.32, 0);
  group.add(banner);

  return group;
}

export const GameBoard3D: React.FC<GameBoard3DProps> = ({
  match,
  isHumanTurn,
  isSelectionValid,
  themePalette = BOARD_THEME_DARK,
  onUpdateSelection,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const latestPropsRef = useRef({
    match,
    isHumanTurn,
    isSelectionValid,
    themePalette,
    onUpdateSelection,
  });
  useEffect(() => {
    latestPropsRef.current = {
      match,
      isHumanTurn,
      isSelectionValid,
      themePalette,
      onUpdateSelection,
    };
  }, [match, isHumanTurn, isSelectionValid, themePalette, onUpdateSelection]);

  const requestRenderRef = useRef<(() => void) | null>(null);
  const updateSceneDataRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect software WebGL per threejs skill guidelines
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const scene = new THREE.Scene();
    const initialBgHex = latestPropsRef.current.themePalette.boardViewportBg;
    scene.background = new THREE.Color(initialBgHex);
    scene.fog = new THREE.FogExp2(initialBgHex, 0.012);

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 250);

    const boardCols = latestPropsRef.current.match.boardCols || latestPropsRef.current.match.boardSize;
    const boardRows = latestPropsRef.current.match.boardRows || latestPropsRef.current.match.boardSize;
    const maxDim = Math.max(boardCols, boardRows);
    camera.position.set(0, maxDim * 0.95, maxDim * 0.75);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio environment map via RoomEnvironment + PMREMGenerator
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Warm key light + cool HemisphereLight fill
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x27231c, 0.75);
    hemiLight.position.set(0, 40, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.35);
    keyLight.position.set(maxDim * 0.5, maxDim * 0.9, maxDim * 0.4);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      const d = maxDim * 0.65;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    // Carved stone pedestal table beneath the tiles
    const tableGeo = new THREE.BoxGeometry(boardCols + 1.6, 0.6, boardRows + 1.6);
    const tableMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(latestPropsRef.current.themePalette.gridLine),
      roughness: 0.8,
      metalness: 0.25,
    });
    const tableMesh = new THREE.Mesh(tableGeo, tableMat);
    tableMesh.position.y = -0.32;
    scene.add(tableMesh);

    // InstancedMesh for all boardRows x boardCols tiles (> 20 repeated items)
    const totalCells = boardRows * boardCols;
    const tileGeo = new THREE.BoxGeometry(0.92, 0.28, 0.92);
    const tileMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.2,
    });
    const instancedTiles = new THREE.InstancedMesh(tileGeo, tileMat, totalCells);
    instancedTiles.frustumCulled = false;
    scene.add(instancedTiles);

    // Place composite 7-part Citadels on each player's starting corner
    const citadelContainer = new THREE.Group();
    scene.add(citadelContainer);

    const halfCol = (boardCols - 1) / 2;
    const halfRow = (boardRows - 1) / 2;
    for (const p of latestPropsRef.current.match.players) {
      if (p.startingCells.length > 0) {
        const pal = PLAYER_PALETTES[p.colorKey as PlayerColorKey] || PLAYER_PALETTES.blue;
        const citadel = buildProceduralCitadelGroup(pal.fillHex, pal.borderHex);
        const anchorCoord = indexToCoord(p.startingCells[0], boardCols);
        citadel.position.set(anchorCoord.col - halfCol, 0.22, anchorCoord.row - halfRow);
        citadelContainer.add(citadel);
      }
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.minDistance = 8;
    controls.maxDistance = maxDim * 2.1;

    // On-demand render scheduler with software-WebGL fenceSync guard
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = window.requestAnimationFrame(() => {
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    requestRenderRef.current = requestRender;

    const updateTileInstances = () => {
      const {
        match: curMatch,
        isSelectionValid: curValid,
        themePalette: palTheme,
      } = latestPropsRef.current;

      scene.background = new THREE.Color(palTheme.boardViewportBg);
      scene.fog = new THREE.FogExp2(palTheme.boardViewportBg, 0.012);
      tableMat.color.set(palTheme.gridLine);

      const selectedSet = new Set<number>(curMatch.selectedCells);
      const slotHexMap = new Map<number, string>();
      for (const p of curMatch.players) {
        const pal =
          palTheme.players[p.colorKey as PlayerColorKey] || palTheme.players.blue;
        slotHexMap.set(p.slotIndex, pal.fillHex);
      }

      for (let i = 0; i < totalCells; i++) {
        const r = Math.floor(i / boardCols);
        const c = i % boardCols;
        const owner = curMatch.board[i];
        const terrainType = curMatch.terrain ? curMatch.terrain[i] : 0;
        const isSelected = selectedSet.has(i);

        const heightScale =
          terrainType === 1
            ? 0.35
            : isSelected
            ? 1.65
            : owner > 0
            ? 1.3
            : terrainType === 2
            ? 0.95
            : 0.75;
        _dummyPos.set(c - halfCol, (0.28 * heightScale) / 2, r - halfRow);
        _dummyQuat.identity();
        _dummyScale.set(1, heightScale, 1);
        _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
        instancedTiles.setMatrixAt(i, _dummyMatrix);

        if (terrainType === 1) {
          _dummyColor.set(palTheme.mode === 'light' ? '#1E40AF' : '#0B253A');
        } else if (isSelected) {
          _dummyColor.set(curValid ? '#FACC15' : '#F87171');
        } else if (owner > 0) {
          _dummyColor.set(slotHexMap.get(owner) || '#3B82F6');
        } else if (terrainType === 2) {
          _dummyColor.set('#B45309');
        } else {
          _dummyColor.set((r + c) % 2 === 0 ? palTheme.emptyTileEven : palTheme.emptyTileOdd);
        }
        instancedTiles.setColorAt(i, _dummyColor);
      }

      instancedTiles.instanceMatrix.needsUpdate = true;
      if (instancedTiles.instanceColor) instancedTiles.instanceColor.needsUpdate = true;
      instancedTiles.computeBoundingSphere();
      requestRender();
    };

    updateSceneDataRef.current = updateTileInstances;
    updateTileInstances();

    controls.addEventListener('change', requestRender);

    // Raycasting for clicking tiles in 3D view
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const { match: curMatch, isHumanTurn: curHuman, onUpdateSelection: updateSel } =
        latestPropsRef.current;
      if (!curHuman || !curMatch.dice) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(instancedTiles, false);
      if (hits.length > 0 && hits[0].instanceId !== undefined) {
        const idx = hits[0].instanceId;
        const activePlayer = curMatch.players.find((p) => p.id === curMatch.activePlayerId);
        if (
          !activePlayer ||
          curMatch.board[idx] === activePlayer.slotIndex ||
          (curMatch.terrain && curMatch.terrain[idx] === 1)
        ) {
          return;
        }

        const nextSel = new Set<number>(curMatch.selectedCells);
        if (nextSel.has(idx)) nextSel.delete(idx);
        else nextSel.add(idx);
        updateSel(Array.from(nextSel));
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        requestRender();
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      controls.removeEventListener('change', requestRender);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      tileGeo.dispose();
      tileMat.dispose();
      tableGeo.dispose();
      tableMat.dispose();
      renderer.dispose();
    };
  }, [match.boardSize, match.boardCols, match.boardRows]);

  useEffect(() => {
    updateSceneDataRef.current?.();
  }, [match.board, match.selectedCells, isSelectionValid, themePalette]);

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ backgroundColor: themePalette.boardViewportBg }}
    >
      <div
        ref={mountRef}
        data-testid="karefetih-3d-canvas"
        className="w-full h-full"
      />
    </div>
  );
};
