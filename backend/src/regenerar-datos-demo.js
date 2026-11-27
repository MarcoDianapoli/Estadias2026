require('dotenv').config();
const crypto = require('crypto');
const pool = require('./db');
const { hashPin } = require('./modules/auth');
const { normalizar, normalizarFamilias, normalizarCodigoSgl } = require('./normalizacion');
const { crearRespaldo } = require('./backup-normalizacion');

const ANIO = 2026;
const SEMILLA = 20261127;

function rng(seed) {
  let valor = seed >>> 0;
  return () => {
    valor += 0x6d2b79f5;
    let t = valor;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const azar = rng(SEMILLA);
const entero = (min, max) => min + Math.floor(azar() * (max - min + 1));
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];
const pad = (n, len = 2) => String(n).padStart(len, '0');

function fechaLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function sumarDias(d, dias, horas = 0) {
  const copia = new Date(d.getTime());
  copia.setDate(copia.getDate() + dias);
  copia.setHours(copia.getHours() + horas);
  return copia;
}
function menorFecha(a, b) {
  return a.getTime() <= b.getTime() ? a : b;
}
function isoWeek(d) {
  const fecha = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  fecha.setUTCDate(fecha.getUTCDate() + 4 - (fecha.getUTCDay() || 7));
  const inicioAnio = new Date(Date.UTC(fecha.getUTCFullYear(), 0, 1));
  return Math.ceil((((fecha - inicioAnio) / 86400000) + 1) / 7);
}
function primerLunes(anio) {
  const fecha = new Date(anio, 0, 1);
  fecha.setDate(fecha.getDate() + ((8 - fecha.getDay()) % 7));
  fecha.setHours(0, 0, 0, 0);
  return fecha;
}
function fechaPlan(lunesAnio, indiceSemana, posicion, porSemana) {
  const fecha = new Date(lunesAnio.getTime());
  fecha.setDate(fecha.getDate() + indiceSemana * 7 + (posicion % 5));
  const turno = Math.floor(posicion / 5);
  fecha.setHours(Math.min(17, 9 + turno * 2), 0, 0, 0);
  return fecha;
}

const rawKey = process.env.ENCRYPTION_KEY;
if (!rawKey || rawKey.length < 16) {
  throw new Error('ENCRYPTION_KEY inválida: no se pueden generar credenciales cifradas');
}
const CIPHER_KEY = crypto.createHash('sha256').update(rawKey).digest();
function cifrar(valor) {
  if (!valor) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', CIPHER_KEY, iv);
  const cifrado = Buffer.concat([cipher.update(String(valor), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), cifrado.toString('base64')].join(':');
}

async function insertar(tabla, columnas, filas) {
  const tamano = 80;
  for (let i = 0; i < filas.length; i += tamano) {
    const lote = filas.slice(i, i + tamano);
    const sentencia = `INSERT INTO \`${tabla}\` (${columnas.map((c) => `\`${c}\``).join(', ')}) VALUES ${lote.map(() => `(${columnas.map(() => '?').join(', ')})`).join(', ')}`;
    await pool.query(sentencia, lote.flat());
  }
}

async function vaciar() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const tabla of [
      'ticket_sessions', 'ticket_events', 'ticket_messages', 'tickets', 'ticket_users',
      'asset_comments', 'metrics', 'maintenance', 'assets', 'devices', 'asset_sequence',
    ]) {
      await conn.query(`DELETE FROM \`${tabla}\``);
      await conn.query(`ALTER TABLE \`${tabla}\` AUTO_INCREMENT = 1`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    conn.release();
  }
}

const USUARIOS = [
  ['admin demo', '9999', 'admin'],
  ['tecnico demo', '2222', 'tecnico'],
  ['usuario demo', '1111', 'usuario'],
  ['javier ramos', '2201', 'tecnico'],
  ['maria estrada', '2202', 'tecnico'],
  ['luis aguilar', '2203', 'tecnico'],
  ['ana garcia', '1101', 'usuario'],
  ['carlos ruiz', '1102', 'usuario'],
  ['brenda nunez', '1103', 'usuario'],
  ['diego hernandez', '1104', 'usuario'],
  ['fernanda lopez', '1105', 'usuario'],
  ['gustavo martinez', '1106', 'usuario'],
  ['itsel ramirez', '1107', 'usuario'],
  ['jorge salazar', '1108', 'usuario'],
  ['karla medina', '1109', 'usuario'],
  ['lucia torres', '1110', 'usuario'],
  ['manuel cruz', '1111', 'usuario'],
  ['nora vega', '1112', 'usuario'],
  ['omar soto', '1113', 'usuario'],
  ['paola mendoza', '1114', 'usuario'],
  ['ricardo velez', '1115', 'usuario'],
  ['sandra chavez', '1116', 'usuario'],
  ['tania morales', '1117', 'usuario'],
  ['ulises castro', '1118', 'usuario'],
];

const UBICACIONES = [
  'nave a', 'nave b', 'almacen', 'calidad', 'prueba electrica',
  'logistica', 'oficinas', 'bodega 1', 'bodega 2',
];
const FAMILIAS = ['cpu', 'teclado', 'raton', 'monitor', 'laptop'];
const MODELOS = {
  cpu: [['hp', 'prodesk 400 g7'], ['dell', 'optiplex 3090'], ['lenovo', 'thinkcentre m720']],
  laptop: [['hp', 'elitebook 840 g7'], ['dell', 'latitude 5420'], ['lenovo', 'thinkpad t14']],
  monitor: [['samsung', 'syncmaster s22b300'], ['lg', '22mp68vq'], ['dell', 'p2219h']],
  teclado: [['logitech', 'k120'], ['hp', 'k1500'], ['dell', 'kb216']],
  raton: [['logitech', 'm90'], ['hp', 'x300'], ['dell', 'ms116']],
};

const DISPOSITIVOS = [
  ['sw-nave-a-01', 'lgx-sw-nave-a-01', 11, 'switch'],
  ['sw-nave-b-01', 'lgx-sw-nave-b-01', 12, 'switch'],
  ['sw-almacen-01', 'lgx-sw-almacen-01', 13, 'switch'],
  ['sw-calidad-01', 'lgx-sw-calidad-01', 14, 'switch'],
  ['sw-pruebas-01', 'lgx-sw-pruebas-01', 15, 'switch'],
  ['sw-oficinas-01', 'lgx-sw-oficinas-01', 16, 'switch'],
  ['ap-nave-a-01', 'lgx-ap-nave-a-01', 17, 'access point'],
  ['ap-nave-b-01', 'lgx-ap-nave-b-01', 18, 'access point'],
  ['ap-almacen-01', 'lgx-ap-almacen-01', 19, 'access point'],
  ['ap-oficinas-01', 'lgx-ap-oficinas-01', 20, 'access point'],
  ['pc-calidad-01', 'lgx-pc-calidad-01', 21, 'cpu'],
  ['pc-calidad-02', 'lgx-pc-calidad-02', 22, 'cpu'],
  ['pc-calidad-03', 'lgx-pc-calidad-03', 23, 'cpu'],
  ['pc-pruebas-01', 'lgx-pc-pruebas-01', 24, 'cpu'],
  ['pc-pruebas-02', 'lgx-pc-pruebas-02', 25, 'cpu'],
  ['pc-logistica-01', 'lgx-pc-logistica-01', 26, 'cpu'],
  ['pc-logistica-02', 'lgx-pc-logistica-02', 27, 'cpu'],
  ['pc-almacen-01', 'lgx-pc-almacen-01', 28, 'cpu'],
  ['pc-almacen-02', 'lgx-pc-almacen-02', 29, 'cpu'],
  ['pc-oficinas-01', 'lgx-pc-oficinas-01', 30, 'cpu'],
  ['pc-oficinas-02', 'lgx-pc-oficinas-02', 31, 'cpu'],
  ['laptop-sistemas-01', 'lgx-laptop-sistemas-01', 32, 'laptop'],
  ['laptop-sistemas-02', 'lgx-laptop-sistemas-02', 33, 'laptop'],
  ['laptop-calidad-01', 'lgx-laptop-calidad-01', 34, 'laptop'],
];

const TITULOS = {
  conectividad: [
    'Sin acceso a internet en nave A',
    'Intermitencia en conexión de terminal de prueba eléctrica',
    'IP duplicada reportada en almacén',
    'No responde switch del pasillo principal',
    'Pérdida de señal WiFi en bodega 2',
  ],
  hardware: [
    'Equipo no enciende después de corte de energía',
    'Monitor parpadea de forma intermitente',
    'Teclado no responde en puesto de calidad',
    'Disco con ruido extraño en laptop de sistemas',
  ],
  software: [
    'Aplicación de reportes se cierra inesperadamente',
    'Actualización de Windows pendiente en equipo de logística',
    'Error de permisos en carpeta compartida',
  ],
  acceso: [
    'Solicitud de credenciales para nuevo usuario',
    'Bloqueo de cuenta por intentos fallidos',
    'Cambio de PIN de estación de trabajo',
  ],
  impresora: [
    'Impresora de etiquetas no responde',
    'Atasco de papel en impresora de almacén',
    'Impresora compartida no aparece en la red',
  ],
};
const DESCRIPCIONES = [
  'El usuario reporta la incidencia desde el inicio de la jornada. Se solicita revisión del equipo y del punto de red.',
  'Se presentó el problema de forma repetida durante la última semana. Afecta la continuidad del proceso en el área.',
  'La falla aparece después de reiniciar el equipo. Se requiere validar configuración y disponibilidad del servicio.',
  'El reporte fue levantado por el responsable del área. Se solicita seguimiento y registro de la solución en el sistema.',
  'Se detecta comportamiento distinto al habitual. El usuario continúa trabajando con una solución temporal.',
];
const ACTIVIDADES_MANT = [
  'Revisión de punto de red y cableado',
  'Limpieza lógica de archivos temporales',
  'Limpieza física: sopleteado y limpieza con alcohol isopropílico',
  'Verificación de switch y enlaces',
  'Revisión de punto de acceso inalámbrico',
  'Validación de direccionamiento IP asignado',
];

async function generar() {
  const respaldo = await crearRespaldo('antes-regeneracion');
  console.log(`Respaldo previo: ${respaldo}`);
  await vaciar();

  const ahora = new Date();
  const hoyMedianoche = new Date(ahora);
  hoyMedianoche.setHours(0, 0, 0, 0);
  const lunes = new Date(hoyMedianoche.getTime());
  lunes.setDate(lunes.getDate() - ((hoyMedianoche.getDay() + 6) % 7));
  const desdeLunes = (dia, hora = 8) => menorFecha(ahora, sumarDias(lunes, dia, hora));

  // Usuarios. El PIN se guarda únicamente como hash scrypt con sal aleatoria.
  const filasUsuarios = USUARIOS.map(([nombre, pin, rol], i) => [
    normalizar(nombre), ...Object.values(hashPin(pin)), rol, 1, fechaLocal(desdeLunes(i % 5, 8 + (i % 10))),
  ]);
  await insertar('ticket_users', ['nombre', 'pin_salt', 'pin_hash', 'rol', 'activo', 'creado_en'], filasUsuarios);
  const [usuarios] = await pool.query('SELECT id, nombre, rol FROM ticket_users ORDER BY id');
  const tecnicos = usuarios.filter((u) => u.rol === 'tecnico');
  const usuariosNormales = usuarios.filter((u) => u.rol === 'usuario');
  const porNombre = new Map(usuarios.map((u) => [u.nombre, u]));

  // Dispositivos: se siembra el estado actual y el historial de la semana.
  const filasDevices = DISPOSITIVOS.map(([deviceId, hostname, octeto, tipo], i) => {
    const ip = `148.202.3.${octeto}`;
    const ultima = i === 21 || i === 22
      ? sumarDias(ahora, 0, -3)
      : new Date(ahora.getTime() - entero(1, 18) * 1000);
    const interfaces = JSON.stringify([
      { name: 'eth0', ip, mac: `00:1a:4b:${pad(i + 1, 2)}:${pad(i + 10, 2)}:${pad(i + 20, 2)}` },
    ]);
    const creado = sumarDias(lunes, Math.min(i % 5, 4), entero(0, 6));
    return [deviceId, hostname, ip, null, interfaces, fechaLocal(creado), fechaLocal(ultima)];
  });
  await insertar('devices', ['device_id', 'hostname', 'ip_address', 'asset_code', 'network_interfaces', 'created_at', 'last_seen'], filasDevices);
  await pool.query('UPDATE devices SET asset_code = CONCAT("sgl-", LPAD(id, 4, "0"))');

  // Inventario SGL con credenciales cifradas con el mismo esquema AES-256-GCM de la app.
  const filasAssets = [];
  for (let i = 1; i <= 122; i += 1) {
    const familiar = FAMILIAS[(i - 1) % FAMILIAS.length];
    const [marca, modelo] = elegir(MODELOS[familiar]);
    const dispositivo = DISPOSITIVOS[i - 1];
    const vinculado = dispositivo ? dispositivo[0] : null;
    const ip = dispositivo ? `148.202.3.${dispositivo[2]}` : `148.202.3.${40 + (i % 190)}`;
    const responsable = elegir(usuarios).nombre;
    const familias = normalizarFamilias({ [familiar]: 1, ...(familiar === 'cpu' ? { monitor: 1, teclado: 1, raton: 1 } : {}) });
    filasAssets.push([
      normalizarCodigoSgl(`sgl-${pad(i, 4)}`), crypto.randomUUID(), vinculado,
      familiar === 'laptop' ? 'laptop' : familiar === 'cpu' ? 'cpu' : familiar,
      familias, marca, modelo, `MX${pad(i + 1000, 6)}`,
      dispositivo ? dispositivo[1] : `lgx-${familiar}-${pad(i, 3)}`, ip,
      `${responsable}@loganmex.com`, vinculado ? `${ip}:5900` : null,
      cifrar('Loganmex2026!'), cifrar('AdminLoganmex2026!'), cifrar('RustDesk2026!'),
      elegir(UBICACIONES), responsable,
      `Equipo registrado en el inventario SGL durante la estadía 2026. Revisión preventiva programada por área.`,
      fechaLocal(desdeLunes(i % 5, 8 + (i % 10))), fechaLocal(sumarDias(ahora, 0, -entero(0, 48) / 24)),
    ]);
  }
  await insertar('assets', [
    'codigo', 'qr_token', 'device_id', 'tipo', 'familias', 'marca', 'modelo', 'numero_serie',
    'hostname', 'ip_address', 'correo', 'vnc', 'password_cifrado', 'admin_password_cifrado',
    'rustdesk_password_cifrado', 'ubicacion', 'responsable', 'notas', 'created_at', 'updated_at',
  ], filasAssets);
  const [assets] = await pool.query('SELECT id, codigo FROM assets ORDER BY id');

  const comentarios = [];
  for (let i = 0; i < 48; i += 1) {
    const asset = assets[(i * 7) % assets.length];
    const autor = elegir(usuarios).nombre;
    comentarios.push([
      asset.id, autor,
      elegir([
        'Se verificó el estado físico del equipo y la conexión del cable de red.',
        'El usuario confirma que el equipo responde correctamente después de la revisión.',
        'Se documenta la asignación del equipo al área correspondiente.',
        'Se recomienda incluir este equipo en la siguiente ronda de mantenimiento preventivo.',
      ]),
      fechaLocal(desdeLunes(entero(0, 4), entero(8, 18))),
    ]);
  }
  await insertar('asset_comments', ['asset_id', 'autor', 'comentario', 'created_at'], comentarios);

  // Métricas de los últimos días para que el dashboard muestre series reales.
  const filasMetrics = [];
  for (let d = 0; d < DISPOSITIVOS.length; d += 1) {
    const desconectado = d === 21 || d === 22;
    for (let j = 0; j < 84; j += 1) {
      const hace = (84 - j) * 2;
      const fecha = sumarDias(desconectado ? sumarDias(ahora, 0, -3) : ahora, 0, -hace / 60);
      const usoCpu = entero(12, desconectado ? 24 : 78);
      filasMetrics.push([
        DISPOSITIVOS[d][0], usoCpu, (2.3 + azar() * 1.5).toFixed(2),
        entero(32, desconectado ? 44 : 88), elegir([8, 16, 32]) * 1024 * 1024 * 1024,
        entero(38, 91), elegir([256, 512, 1024]) * 1024 * 1024 * 1024,
        `148.202.3.${DISPOSITIVOS[d][2]}`, fechaLocal(fecha),
      ]);
    }
  }
  await insertar('metrics', [
    'device_id', 'cpu_usage', 'cpu_speed_ghz', 'memory_usage', 'memory_total',
    'disk_usage', 'disk_total', 'ip_address', 'recorded_at',
  ], filasMetrics);

  // Tickets con solicitantes, técnicos, eventos y conversaciones.
  const estado = ['abierto', 'en proceso', 'resuelto', 'cerrado'];
  const filasTickets = [];
  const filasEventos = [];
  const filasMensajes = [];
  for (let i = 0; i < 54; i += 1) {
    const categoria = elegir(Object.keys(TITULOS));
    const titulo = elegir(TITULOS[categoria]);
    const descripcion = elegir(DESCRIPCIONES);
    const solicitante = elegir(usuariosNormales);
    const tecnico = elegir(tecnicos);
    const estadoTicket = estado[entero(0, 3)];
    const creado = desdeLunes(i < 12 ? i % 5 : entero(0, 4), entero(8, 17));
    const limite = menorFecha(ahora, sumarDias(creado, 0, 2));
    const tomado = estadoTicket === 'abierto' ? null : menorFecha(ahora, sumarDias(creado, 0, entero(1, 5)));
    const resuelto = ['resuelto', 'cerrado'].includes(estadoTicket) && tomado
      ? menorFecha(ahora, sumarDias(tomado, 0, entero(2, 20))) : null;
    const cerrado = estadoTicket === 'cerrado' && resuelto
      ? menorFecha(ahora, sumarDias(resuelto, 0, entero(1, 10))) : null;
    const codigo = `tkt-${ANIO}-${pad(i + 1, 5)}`;
    filasTickets.push([
      codigo, categoria, titulo, descripcion, estadoTicket,
      ['baja', 'media', 'alta'][entero(0, 2)],
      estadoTicket === 'abierto' ? null : tecnico.nombre,
      solicitante.id, tomado ? tecnico.id : null,
      tomado ? fechaLocal(tomado) : null,
      resuelto ? fechaLocal(resuelto) : null,
      cerrado ? fechaLocal(cerrado) : null,
      fechaLocal(creado), fechaLocal(limite),
    ]);
    filasEventos.push([i + 1, solicitante.id, 'creado', 'Ticket registrado desde la consola local', fechaLocal(creado)]);
    if (tomado) filasEventos.push([i + 1, tecnico.id, 'tomado', `Atendido por ${tecnico.nombre}`, fechaLocal(tomado)]);
    if (resuelto) filasEventos.push([i + 1, tecnico.id, 'estado', 'Estado cambiado a resuelto', fechaLocal(resuelto)]);
    if (cerrado) filasEventos.push([i + 1, tecnico.id, 'estado', 'Estado cambiado a cerrado', fechaLocal(cerrado)]);
    if (i % 3 === 0) {
      filasMensajes.push([
        i + 1, solicitante.id, 'Buenos días, el problema sigue presente en el área. ¿Podrían revisarlo?',
        null, fechaLocal(creado),
      ]);
      filasMensajes.push([
        i + 1, tecnico.id, 'Gracias por el reporte. Estamos validando el punto de red y el equipo.',
        null, fechaLocal(tomado || sumarDias(creado, 0, 1)),
      ]);
    }
    if (i % 5 === 0) {
      filasMensajes.push([
        i + 1, solicitante.id, 'Confirmo que el servicio quedó funcionando correctamente. Gracias.',
        null, fechaLocal(resuelto || sumarDias(creado, 0, 3)),
      ]);
    }
  }
  await insertar('tickets', [
    'codigo', 'categoria', 'titulo', 'descripcion', 'estado', 'prioridad', 'responsable',
    'solicitante_usuario_id', 'tecnico_usuario_id', 'tomado_en', 'resuelto_en', 'cerrado_en',
    'created_at', 'updated_at',
  ], filasTickets);
  await insertar('ticket_events', ['ticket_id', 'usuario_id', 'accion', 'detalle', 'creado_en'], filasEventos);
  await insertar('ticket_messages', ['ticket_id', 'usuario_id', 'mensaje', 'leido_en', 'creado_en'], filasMensajes);

  // Plan anual de mantenimiento. Técnico y observaciones quedan vacíos: nadie lo ha ejecutado aún.
  const lunesAnio = primerLunes(ANIO);
  const filasMantenimiento = [];
  for (let ronda = 1; ronda <= 2; ronda += 1) {
    const tipo = ronda === 1 ? 'logico' : 'fisico';
    const actividad = tipo === 'logico'
      ? 'Limpieza lógica de archivos temporales'
      : 'Limpieza física: sopleteado y limpieza con alcohol isopropílico';
    for (let i = 0; i < assets.length; i += 1) {
      const semanaPlan = (ronda === 1 ? 1 : 40) + Math.floor(i / 10);
      const fecha = fechaPlan(lunesAnio, semanaPlan - 1, i % 10, 10);
      filasMantenimiento.push([
        assets[i].codigo, actividad, tipo, fechaLocal(fecha), 'pendiente', null, null,
        'anual', ANIO, ronda, isoWeek(fecha), fechaLocal(desdeLunes(entero(0, 2), entero(8, 18))),
      ]);
    }
  }
  for (let i = 0; i < 28; i += 1) {
    let fecha = new Date(ANIO, (i * 5) % 12, 2 + ((i * 13) % 26), 9 + (i % 6), 0, 0);
    if (isoWeek(fecha) === isoWeek(lunes)) fecha = sumarDias(fecha, 14);
    filasMantenimiento.push([
      assets[(i * 11) % assets.length].codigo, elegir(ACTIVIDADES_MANT), elegir(['logico', 'fisico']),
      fechaLocal(fecha), 'pendiente', null, null, 'manual', null, null, isoWeek(fecha),
      fechaLocal(desdeLunes(entero(0, 2), entero(8, 18))),
    ]);
  }
  await insertar('maintenance', [
    'codigo', 'actividad', 'tipo', 'fecha_programada', 'estatus', 'responsable', 'observaciones',
    'origen', 'anio_plan', 'ronda', 'semana', 'created_at',
  ], filasMantenimiento);

  await pool.query('INSERT INTO asset_sequence (id, next_value) VALUES (1, 123)');

  const tablas = [
    'ticket_users', 'devices', 'assets', 'asset_comments', 'metrics', 'tickets',
    'ticket_events', 'ticket_messages', 'maintenance', 'asset_sequence',
  ];
  const resumen = {};
  for (const tabla of tablas) {
    const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM \`${tabla}\``);
    resumen[tabla] = Number(rows[0].total);
  }
  const [semana] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(responsable IS NOT NULL AND responsable <> '') AS con_tecnico,
            SUM(observaciones IS NOT NULL AND observaciones <> '') AS con_observaciones
       FROM maintenance WHERE fecha_programada >= ? AND fecha_programada < ?`,
    [fechaLocal(lunes), fechaLocal(sumarDias(lunes, 7))],
  );
  resumen.mantenimientoSemanaActual = semana[0];
  return resumen;
}

if (require.main === module) {
  generar()
    .then((resumen) => {
      console.log(JSON.stringify(resumen, null, 2));
      return pool.end();
    })
    .catch((err) => {
      console.error('No se pudo regenerar la base de datos:', err);
      process.exit(1);
    });
}

module.exports = { generar };
