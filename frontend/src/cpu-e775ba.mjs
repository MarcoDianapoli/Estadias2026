import * as THREE from 'three';

// Modelo 3D local de una CPU de escritorio (torre), construido con geometrías de Three.js.
// Expone createAsset(props) para usar directamente con <primitive object={obj} />.
const PALETTES = {
  'gray-2025': {
    body: '#8b949e',
    bottom: '#6b7280',
    trim: '#b8c0ca',
    bezel: '#1f2937',
    board: '#1e293b',
    dark: '#374151',
    metal: '#cbd5e1',
    glass: '#93c5fd',
    accent: '#60a5fa',
    logo: '#f8fafc',
  },
  'matte-black-2025': {
    body: '#151b23',
    bottom: '#0c1118',
    trim: '#202a36',
    bezel: '#070b10',
    board: '#111827',
    dark: '#1f2937',
    metal: '#475569',
    glass: '#38bdf8',
    accent: '#38bdf8',
    logo: '#e2e8f0',
  },
};

const DEFAULT_COLORWAY = 'gray-2025';

function standard(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.35,
    ...options,
  });
}

function addBox(parent, size, position, material, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, radius, length, position, rotation, material) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 20),
    material,
  );
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeLabelTexture(palette, props = {}) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 220;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, 512, 220);
  gradient.addColorStop(0, '#0b1220');
  gradient.addColorStop(0.6, '#12224a');
  gradient.addColorStop(1, palette.accent);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 220);

  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, 488, 196);

  // El frente de la torre muestra únicamente el código SGL en grande.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.logo;
  ctx.font = 'bold 78px ui-monospace, Consolas, monospace';
  ctx.fillText(String(props.codigo || 'SGL-0000'), 256, 112);

  const texture = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addFan(parent, position, radius, ringMat, bladeMat) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 8, 24), ringMat);
  ring.position.set(...position);
  ring.castShadow = true;
  parent.add(ring);

  for (let i = 0; i < 5; i += 1) {
    const angle = (i * Math.PI * 2) / 5;
    addBox(
      parent,
      [radius * 1.25, 0.06, 0.018],
      [position[0] + Math.cos(angle) * radius * 0.45, position[1] + Math.sin(angle) * radius * 0.45, position[2]],
      bladeMat,
      [0, 0, angle],
    );
  }
  addCylinder(parent, 0.1, 0.05, position, [Math.PI / 2, 0, 0], ringMat);
}

export function createAsset(props = {}) {
  const colorway = props.colorway || DEFAULT_COLORWAY;
  const palette = PALETTES[colorway] || PALETTES[DEFAULT_COLORWAY];

  const W = 1.9;
  const H = 3.6;
  const D = 2.2;

  const group = new THREE.Group();
  group.name = 'cpu-e775ba';
  group.userData.colorway = colorway;
  group.userData.tipo = 'cpu';

  const caseMat = standard(palette.body, { roughness: 0.34, metalness: 0.55 });
  const bottomMat = standard(palette.bottom, { roughness: 0.5, metalness: 0.4 });
  const trimMat = standard(palette.trim, { roughness: 0.4, metalness: 0.5 });
  const bezelMat = standard(palette.bezel, { roughness: 0.35, metalness: 0.25 });
  const boardMat = standard(palette.board, { roughness: 0.65, metalness: 0.2 });
  const darkMat = standard(palette.dark, { roughness: 0.6, metalness: 0.3 });
  const metalMat = standard(palette.metal, { roughness: 0.3, metalness: 0.75 });
  const accentMat = standard(palette.accent, {
    roughness: 0.35,
    metalness: 0.2,
    emissive: palette.accent,
    emissiveIntensity: 0.4,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: palette.glass,
    transparent: true,
    opacity: 0.16,
    roughness: 0.08,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Carcasa: panel opaco a la izquierda y ventana lateral a la derecha.
  addBox(group, [W, 0.08, D], [0, 0.04, 0], bottomMat);
  addBox(group, [W, 0.08, D], [0, H - 0.04, 0], caseMat);
  addBox(group, [W, H, 0.08], [0, H / 2, -D / 2 + 0.04], caseMat);
  addBox(group, [W, H, 0.08], [0, H / 2, D / 2 - 0.04], caseMat);
  addBox(group, [0.08, H, D], [-W / 2 + 0.04, H / 2, 0], caseMat);

  const glass = addBox(group, [0.05, H - 0.24, D - 0.24], [W / 2 - 0.02, H / 2, 0], glassMat);
  glass.castShadow = false;
  glass.renderOrder = 2;
  for (const y of [0.12, H - 0.12]) {
    addBox(group, [0.1, 0.12, D], [W / 2 - 0.02, y, 0], trimMat);
  }
  for (const z of [-D / 2 + 0.12, D / 2 - 0.12]) {
    addBox(group, [0.1, H, 0.12], [W / 2 - 0.02, H / 2, z], trimMat);
  }

  // Interior visible a través de la ventana: placa, CPU, memorias y tarjeta gráfica.
  addBox(group, [0.05, 2.7, 1.7], [-W / 2 + 0.18, H / 2, -0.1], boardMat);
  addBox(group, [0.3, 0.5, 0.5], [-0.55, 2.55, -0.35], metalMat);
  addBox(group, [0.34, 0.08, 0.42], [-0.36, 2.55, -0.35], darkMat);
  for (const z of [0.32, 0.52]) {
    addBox(group, [0.18, 1.05, 0.12], [-0.5, 2.15, z], trimMat);
    addBox(group, [0.05, 0.12, 0.14], [-0.39, 1.66, z], accentMat);
  }
  addBox(group, [0.34, 0.16, 1.2], [-0.32, 1.35, -0.05], darkMat);
  addBox(group, [0.36, 0.03, 1.15], [-0.13, 1.35, -0.05], metalMat);
  addBox(group, [1.05, 0.5, 1.35], [0.05, 0.5, -0.1], bottomMat);

  addFan(group, [0.12, 2.25, D / 2 - 0.22], 0.42, bezelMat, metalMat);
  addFan(group, [0.12, 2.7, -D / 2 + 0.18], 0.34, bezelMat, metalMat);

  // Frontal: rejilla, botón de encendido, puertos y etiqueta con el código.
  for (let y = 0.75; y <= 2.0; y += 0.16) {
    addBox(group, [0.92, 0.025, 0.02], [0.33, y, D / 2 + 0.012], bezelMat);
  }
  addCylinder(group, 0.11, 0.05, [-0.62, H - 0.28, D / 2 + 0.02], [Math.PI / 2, 0, 0], accentMat);
  for (const y of [H - 0.55, H - 0.72]) {
    addBox(group, [0.2, 0.06, 0.02], [-0.62, y, D / 2 + 0.02], bezelMat);
  }
  addBox(group, [0.04, H - 0.6, 0.02], [-W / 2 + 0.14, H / 2, D / 2 + 0.02], accentMat);

  const texture = makeLabelTexture(palette, props);
  const labelMat = new THREE.MeshBasicMaterial({
    color: texture ? '#ffffff' : palette.bezel,
    map: texture,
    toneMapped: false,
  });
  addBox(group, [1.46, 0.62, 0.012], [0.05, H - 1.25, D / 2 + 0.014], labelMat);

  // Pies de la torre.
  for (const x of [-W / 2 + 0.25, W / 2 - 0.25]) {
    for (const z of [-D / 2 + 0.25, D / 2 - 0.25]) {
      addCylinder(group, 0.08, 0.06, [x, -0.03, z], [0, 0, 0], bottomMat);
    }
  }

  // Escalar y centrar para que el Canvas con cámara [3, 3, 4] lo encuadre bien.
  group.scale.setScalar(1.45);
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  group.position.sub(bounds.getCenter(new THREE.Vector3()));

  return group;
}
