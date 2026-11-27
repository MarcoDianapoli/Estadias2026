const MUTE_KEY = 'loganmex_notificaciones_silenciadas';

let contexto;

export function estaSilenciado() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function alternarSonido() {
  const siguiente = !estaSilenciado();
  try {
    localStorage.setItem(MUTE_KEY, siguiente ? '1' : '0');
  } catch {
    // Sin localStorage el ajuste solo dura esta sesión.
  }
  return siguiente;
}

export function resumirAudio() {
  const ctx = contexto || crearContexto();
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
}

function crearContexto() {
  if (typeof window === 'undefined') return null;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return null;
  if (!contexto || contexto.state === 'closed') contexto = new Audio();
  return contexto;
}

function tono(ctx, frecuencia, inicio, duracion, volumen = 0.07) {
  const oscilador = ctx.createOscillator();
  const ganancia = ctx.createGain();
  oscilador.type = 'sine';
  oscilador.frequency.value = frecuencia;
  ganancia.gain.setValueAtTime(0.0001, inicio);
  ganancia.gain.linearRampToValueAtTime(volumen, inicio + 0.015);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
  oscilador.connect(ganancia).connect(ctx.destination);
  oscilador.start(inicio);
  oscilador.stop(inicio + duracion + 0.03);
}

export function reproducirSonido(tipo) {
  if (estaSilenciado()) return;
  const ctx = crearContexto();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const t = ctx.currentTime + 0.01;
  if (tipo === 'nuevo') {
    tono(ctx, 660, t, 0.12);
    tono(ctx, 880, t + 0.13, 0.16);
  } else if (tipo === 'tomado') {
    tono(ctx, 520, t, 0.10);
    tono(ctx, 700, t + 0.09, 0.12);
  } else if (tipo === 'chat') {
    tono(ctx, 880, t, 0.07);
  } else if (tipo === 'estado') {
    tono(ctx, 600, t, 0.10);
    tono(ctx, 760, t + 0.09, 0.13);
  }
}
