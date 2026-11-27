# Monitoreo remoto de equipos — Loganmex

Aplicación web para consultar el estado, la disponibilidad y el consumo de recursos
(CPU, RAM y almacenamiento) de las computadoras de la red en tiempo real.

**Stack:** React 18 + Vite 6 · Node.js 20 + Express + Socket.IO · MySQL 8 / MariaDB 10.11 · Chart.js 4 · systeminformation

---

## 1. Requisitos

- Node.js 20 LTS (funciona también con 18+)
- MySQL 8 o MariaDB 10.11+
- Navegador moderno (Chrome, Edge, Firefox)

---

## 2. Base de datos

Importar el esquema:

```bash
# Linux
mysql -u monitoreo -p monitoreo < backend/sql/schema.sql

# Windows
mysql -u monitoreo -p monitoreo < backend\sql\schema.sql
```

Crear el usuario de la aplicación (si aún no existe):

```sql
CREATE USER 'monitoreo'@'localhost' IDENTIFIED BY 'TuPasswordSeguro';
GRANT ALL PRIVILEGES ON monitoreo.* TO 'monitoreo'@'localhost';
FLUSH PRIVILEGES;
```

> En Ubuntu, el root usa `auth_socket`, por eso se crea un usuario aparte.

Después del esquema base, aplicar la migración del módulo de tickets (idempotente):

```bash
cd monitoreo/backend
npm install
npm run migrate:tickets
```

Crea `ticket_users`, `ticket_sessions`, `ticket_events`, `ticket_messages` y las columnas nuevas de `tickets`, además de las cuentas de arranque.

### Normalización de la base de datos

Los campos de control y los nombres se guardan en **minúsculas y sin acentos**: estatus, prioridad, tipo, rol, categoría, responsable, usuario, hostname, `device_id`, ubicación, familias y códigos (`sgl-0001`, `tkt-2026-00001`). La interfaz los capitaliza al mostrar (`Abierto`, `Técnico`, `Lógico`, `SGL-0001`, `PC-01`). Se aceptan mayúsculas y acentos al escribir; la API los normaliza antes de guardar o consultar.

**Quedan fuera** (se conservan tal cual, con mayúsculas y acentos): `tickets.titulo`, `tickets.descripcion`, `ticket_messages.mensaje`, `maintenance.actividad`, `maintenance.observaciones`, `asset_comments.comentario` y `assets.notas`.

Para una base ya existente, ejecutar **desde `monitoreo/backend`**:

```bash
npm run check                 # valida sintaxis de los scripts
npm run backup:normalizacion  # opcional: solo el respaldo
npm run migrate:normalizacion # respaldo automático + migración idempotente
```

El paso previo crea un SQL completo en `backend/backups/antes-normalizacion-<fecha>.sql` (carpeta ignorada por Git). La migración convierte los ENUM a `abierto`/`en proceso`/`resuelto`/`cerrado`, `baja`/`media`/`alta`, `pendiente`/`en proceso`/`completado`/`cancelado` y `logico`/`fisico`, y normaliza el texto de control. Se puede repetir sin cambiar los datos ya migrados. Después de ejecutarla, reiniciar la API para que cargue los nuevos valores.

### Datos demo y simulador de agentes

Para regenerar toda la base con datos simulados realistas (siempre con respaldo previo en `backend/backups/antes-regeneracion-<fecha>.sql`):

```bash
cd monitoreo/backend
npm run db:regenerar
```

La regeneración siembra 24 usuarios, 24 dispositivos, 122 equipos SGL, 54 tickets y 272 órdenes de mantenimiento. Todos los registros de uso arrancan el lunes 23 de noviembre de 2026; la semana actual queda con 10 órdenes pendientes, sin técnico ni observaciones. Los PIN se guardan como hash scrypt y las credenciales de las fichas con AES-256-GCM, sin texto plano.

Para que el dashboard muestre agentes activos sin instalar el agente real en cada PC:

```bash
cd monitoreo/backend
npm run demo:agentes
```

El simulador envía métricas por `POST /api/metrics` cada 5 segundos para 22 dispositivos y deja 2 laptops desconectadas. Es un proceso adicional, no un segundo servidor; el backend sigue siendo un único `node src/server.js` y el frontend un único `npm run dev`.

---

## 3. Configuración

Copiar la plantilla y editar los valores:

```bash
cp backend/.env.example backend/.env       # Linux
copy backend\.env.example backend\.env     # Windows
```

| Variable | Descripción | Ejemplo |
|---|---|---|
| `PORT` | Puerto de la API | `3001` |
| `DB_HOST` | Servidor de MySQL | `localhost` |
| `DB_USER` / `DB_PASSWORD` | Credenciales | `monitoreo` |
| `DB_NAME` | Base de datos | `monitoreo` |
| `ENCRYPTION_KEY` | Clave secreta de al menos 16 caracteres; se deriva a 32 bytes con SHA-256 para AES-256-GCM. Si falta, la API no arranca. No cambiarla después de cifrar credenciales | frase larga y aleatoria |
| `AGENT_DEVICE_ID` | Nombre del equipo (se guarda en minúsculas) | `pc-01` |
| `AGENT_INTERVAL` | Frecuencia de lectura (ms) | `5000` |
| `API_URL` | Destino de las métricas | `http://localhost:3001` |
| `PUBLIC_BASE_URL` | IP LAN que se graba en el QR | `http://148.202.3.204:5173` |
| `TICKET_SESSION_HOURS` | Horas de vigencia de la sesión por PIN | `12` |

---

## 4. Ejecución

Se necesitan **tres terminales**:

```bash
# Terminal 1 — API y Socket.IO
cd monitoreo/backend
npm install
npm run migrate:tickets   # solo la primera vez / tras actualizar el esquema
npm run dev               # http://localhost:3001

# Terminal 2 — Agente
cd monitoreo/backend
npm run agent        # envía lecturas cada 5 s

# Terminal 3 — Frontend
cd monitoreo/frontend
npm install
npm run dev          # http://localhost:5173
```

Para producción, usar `node src/server.js` en lugar de `npm run dev`.

---

## 5. Acceso local y roles

La app completa se abre en **http://localhost:5173** y pide **usuario + PIN**. La sesión se guarda en BD con el token hasheado; el PIN nunca se almacena en texto (scrypt + salt). Vigencia por defecto: 12 h (`TICKET_SESSION_HOURS`).

Cuentas de arranque creadas por `npm run migrate:tickets` (solo para poner en marcha la LAN, cámbialas después). Los nombres se guardan normalizados; el login acepta `Usuario demo`, `Técnico demo` o `Admin demo` igual que su forma normalizada:

| Usuario en BD | PIN | Rol |
|---|---|---|
| `usuario demo` | `1111` | Usuario |
| `tecnico demo` | `2222` | Técnico |
| `admin demo` | `9999` | Administrador |

- **Usuario:** único módulo disponible es **Tickets**: registra incidencias y consulta sus propios tickets en las secciones «Pendientes» y «Cerrados». Dashboard, monitoreo, inventario, fichas, mantenimiento y sus APIs responden con redirección o `403`.
- **Técnico:** ve exactamente cuatro apartados: **Generales** (todos los pendientes sin tomar), **Tomados** (los que toma y aún no cierra), **Cerrados** y **Chat**. Toma tickets por autoadjudicación y cambia estatus a Resuelto/Cerrado.
- **Administrador:** ve **Todos**, todas las secciones anteriores y el panel de accesos (crear/desactivar usuarios, cambiar roles y PIN, editar prioridad y eliminar tickets).

Públicos sin sesión: `GET /api/health`, `POST /api/metrics` (agente), `GET /api/assets/token/:token` y `GET /api/assets/:id/qr` (QR). La ficha pública del QR **no devuelve credenciales**; solo con sesión de técnico o administrador se muestran y editan las contraseñas cifradas con AES-256-GCM.

---

## 6. Manual de usuario

Al abrir **http://localhost:5173**:

La barra superior muestra siempre el título del módulo y una descripción breve debajo (en Tickets, según el rol); esos textos ya no se repiten en el encabezado de cada página.

1. **Panel general (`/`):** arriba muestra el **estado del sistema** (API/local, base de datos, agente y Socket.IO; Operativo / Atención / Sin conexión) y tres gráficas de barras por día de la semana: **tickets** (creados, tomados, resueltos y cerrados), **mantenimientos** (pendientes, en proceso, completados y cancelados) y **agentes** (equipos detectados y lecturas enviadas). Cada una muestra totales por serie. También se conserva la gráfica apilada de **mantenimientos por actividad y estatus**; al pasar el cursor o tocar una barra se ven código, fecha, tipo y responsable de cada orden. Después están los accesos rápidos, agentes detectados/en línea, tickets, mantenimientos de la semana y equipos en inventario. Cada aviso de vinculación lleva a su corrección. `GET /api/dashboard/weekly` entrega las tres series; `GET /api/health` consulta realmente la base de datos.
2. **Monitoreo (`/monitoreo`):** tabla de agentes con IP principal, CPU/RAM/disco, última lectura y estado; alertas por umbral o desconexión. El buscador es una lupa flotante abajo a la derecha, en la misma posición del botón «Nuevo ticket» de Tickets; al abrirla busca por hostname, IP o `device_id`. Hay filtros por estado (En línea/Desconectado) y nivel de alerta (Crítica/Aviso/Sin alertas); la tabla, las tarjetas y el panel de alertas se recalculan con los filtros. La última lectura se expresa en segundos, minutos u horas según el tiempo sin reportes. El historial de las últimas 40 lecturas de CPU y RAM se muestra solo dentro de **Ver detalle**.
   - Verde = normal · Amarillo = aviso (≥ 70 %) · Rojo = crítico (≥ 85 %).
   - **En línea** = datos en los últimos 20 s; si no, **Desconectado**.
   - Las IP de Tailscale/ZeroTier se ven solo en **Ver detalle**.
3. **Inventario QR (`/inventario`):** altas, edición, importación/exportación, QR, vinculación y credenciales. El buscador es una lupa flotante abajo a la derecha; al abrirla busca por código, usuario, IP, hostname o agente. Hay filtros por tipo y vinculación; la paginación y la exportación de Excel respetan los resultados filtrados. Los códigos van de `sgl-0001` en adelante y se muestran como `SGL-0001`.
4. **Ficha (`/ficha?ficha=<token>`):** datos, **estatus de mantenimiento** (calculado desde la orden activa o la última orden registrada), QR, modelo 3D representativo y comentarios. «Imprimir código y QR» imprime el código, el QR y el estatus de mantenimiento.
5. **Tickets (`/tickets`):** registro, bitácora y chat de incidencias. La lupa flotante queda justo encima del botón **Nuevo ticket** y abre el buscador por título, código, categoría o persona; la lista también tiene filtros por estatus y prioridad, sin cambiar el `scope` ni los permisos por rol, y la autoselección sigue los resultados filtrados. El botón **Nuevo ticket** es un botón flotante animado abajo a la derecha; el resumen de contadores (generales, tomados, cerrados y total) ya no se muestra. En la lista, los tickets no seleccionados llevan un indicador por estado: azul (abierto), naranja (en proceso), verde (resuelto) y gris (cerrado); el ticket seleccionado pasa al verde de marca. La navegación principal es un sidebar izquierdo; la barra superior muestra el título de la página y su descripción, la campana y el avatar (que abre `/configuración`). Al fondo del sidebar están **Cuenta**, **Mi cuenta**, **Seguridad**, **Notificaciones**, **Ayuda**, **Cerrar sesión** y, solo para administradores, **Administración de accesos**, que abre el panel en Configuración (ya no se duplica dentro de Tickets). Al hacer clic en **Cuenta**, el sidebar se expande o contrae con animación; en móvil se abre como drawer con el botón ☰ de la barra superior.
6. **Configuración (`/configuracion`):** disponible para todos los roles. Permite consultar la cuenta activa, cambiar el propio PIN (con verificación del PIN actual; `POST /api/auth/me/pin`), silenciar o reactivar los sonidos de avisos y cerrar la sesión. El panel de **Administración de accesos** aparece únicamente para el rol administrador (crear/desactivar usuarios, cambiar roles y PIN ajenos).
7. **Mantenimiento (`/mantenimiento`):** órdenes por código SGL con fecha programada, responsable, observaciones y estatus (Pendiente / En proceso / Completado / Cancelado; en BD: `pendiente`, `en proceso`, `completado`, `cancelado`). El tipo es **Lógico** (limpieza de archivos temporales y afines) o **Físico** (sopleteado y limpieza con alcohol isopropílico; en BD: `logico`, `fisico`). Hay filtros de periodo, origen, año, estatus y tipo, e indicador de la meta semanal de **10–12 equipos**; la operación contempla **3 visitas por equipo al año**. El botón **Generar plan anual** reparte automáticamente los equipos del inventario en 3 rondas, con 10 ordenes por semana (lunes a viernes), alternando limpieza lógica y física; cada orden queda marcada con año, ronda y semana. El plan es idempotente: si ya existe para ese año no se duplica; solo el administrador puede reemplazarlo. Técnicos y administradores crean y editan, y solo el administrador elimina. API: `GET/POST /api/maintenance`, `GET/PATCH/DELETE /api/maintenance/:id`, `POST /api/maintenance/generar-anual` y `GET /api/maintenance/plan-anual`. La migración `npm run migrate:mantenimiento-anual` agregó las columnas `origen`, `anio_plan`, `ronda` y `semana`.

La gráfica, los estados, los tickets y el chat se actualizan solos gracias a Socket.IO. La campana de la barra superior abre un panel lateral derecho de notificaciones (no una página): ticket nuevo (técnicos y administradores), ticket tomado (solicitante y administradores), cada cambio de estado del ticket (solicitante) y mensajes de chat (participantes y administradores). El badge muestra solo las no leídas (`9+`/`99+`, nunca `0`), los avisos se agrupan por día y tipo, y «Ver todas y marcar leídas» las marca como leídas; «Preferencias» abre `/configuracion#notificaciones`. Cada aviso reproduce un sonido breve generado por Web Audio API (sin archivos ni dependencias); el botón de altavoz dentro del panel los silencia o los reactiva. El usuario normal también ve la campana, pero sin los avisos de vinculación del inventario. Técnicos y administradores están en la sala `tickets` y ven todas las incidencias; cada usuario normal se une solo a `ticket-user:<id>`, por lo que por socket solo recibe eventos de sus propios tickets.

La interfaz añade animaciones sutiles de entrada en tarjetas, paneles, listas, campana y mensajes de error, además de transiciones al pasar el cursor por los botones. Si el sistema tiene activado «reducir movimiento», las animaciones se desactivan automáticamente.

La paleta verde de marca quedó centralizada en `frontend/src/styles.css`: `50 #f6f9f7`, `100 #ebf4f0`, `200 #cfe8dc`, `300 #a1d8be`, `400 #6fcda0`, `500 #26cd7d`, `600 #19b56b`, `700 #129858`, `800 #0c7a45` y `900 #075a32`. El tono 500 se usa como acento; los rellenos con texto blanco usan 800/900 para cumplir WCAG AA. Botones, enlaces, sidebar, pestañas activas, FAB, lupa, foco y gráfica de agentes usan el verde; los estatus de tickets y las alertas conservan sus colores semánticos (abierto azul, en proceso naranja, resuelto verde, cerrado gris y crítico rojo).

---

## 7. Monitorear varias computadoras

En cada PC remota:

1. Copiar la carpeta `backend` e instalar con `npm install`.
2. En su `.env` cambiar:

```dotenv
AGENT_DEVICE_ID=PC-02
API_URL=http://192.168.1.50:3001
```

3. Ejecutar `npm run agent`.

En el servidor abrir el puerto:

```bash
sudo ufw allow 3001/tcp                                    # Linux
netsh advfirewall firewall add rule name="Monitoreo 3001" dir=in action=allow protocol=TCP localport=3001   # Windows
```

Los equipos aparecen solos en la pestaña **Monitoreo** al llegar la primera lectura. El dashboard `/` muestra los accesos rápidos al inicio y las tarjetas de agentes detectados/en línea, tickets (abiertos/en proceso), mantenimientos pendientes de la semana y equipos en inventario. Los datos se obtienen de `GET /api/dashboard/summary` (tablas `tickets` y `maintenance`, migración `backend/sql/migration_modulos.sql`).

---

## 8. Arranque automático

- **Linux:** servicio `systemd` con `Restart=always`.
- **Windows:** Programador de tareas (desencadenador *Al iniciar sesión*) o NSSM como servicio real.
- En ambos casos, el directorio de trabajo debe ser `monitoreo/backend` para que se lea el `.env`.

---

## 9. Verificación rápida

```bash
# Público
curl http://localhost:3001/api/health

# Login local y token para el resto de endpoints
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"nombre":"admin demo","pin":"9999"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).token")

curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/devices
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/metrics?limit=3"
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/tickets?scope=all"

# Desde monitoreo/backend
npm run check

# Desde monitoreo/frontend
npm run build
```

---

## 10. Solución de problemas encontrados durante el desarrollo

| Síntoma | Causa | Solución |
|---|---|---|
| `EADDRINUSE :::3001` | Servidor iniciado dos veces | Cerrar el duplicado; solo uno escucha el puerto |
| `Access denied for user 'monitoreo'` | Usuario o contraseña distintos al `.env` | Recrear el usuario con la misma contraseña |
| `Unknown column 'd.ipaddress'` | Falta el guion bajo | Usar `d.ip_address` |
| `The "string" argument ... Received undefined` | Campo numérico vacío al insertar | Normalizar vacíos a `null` antes del `INSERT` |
| RAM marca 90 % pero el sistema dice 37 % | `systeminformation` cuenta `buff/cache` como usado | Calcular `(total - available) / total * 100` |
| `npm run agent` abre el servidor | Script mal apuntado en `package.json` | `"agent": "node src/agent.js"` |
| La gráfica no se ve | Contenedor sin altura | `.chart-wrap { height: 320px; }` |
| `401 Inicia sesión para continuar` | Token ausente o sesión expirada | Entrar de nuevo con usuario + PIN; el agente no necesita token para `POST /api/metrics` |
| `Usuario o PIN incorrectos` | Cuenta inactiva o PIN cambiado | Pedir al administrador reactivarla y asignar un PIN nuevo |
| La ficha del QR no muestra credenciales | Es la vista pública del QR | Abrir la ficha desde el inventario con sesión interna |
## Historial de entregas (2026)

- 2026-10-01 · Inicio del repositorio y reglas de Git.
- 2026-10-05 · Servidor, base de datos y agente de monitoreo.
- 2026-10-12 · Esquema SQL y migraciones de inventario y tickets.
- 2026-10-19 · Autenticación local con usuario y PIN hasheado.
- 2026-10-26 · Módulo de tickets, roles y scopes.
- 2026-11-02 · Inventario, enlaces públicos y credenciales cifradas.
- 2026-11-09 · Frontend base, sesión, diseño y accesibilidad.
- 2026-11-16 · Módulos de monitoreo, inventario y ficha.
- 2026-11-23 · Consola de tickets, notificaciones y sonidos.
- 2026-11-24 · Aislamiento por usuario, verificación final, cifrado estricto, animaciones, módulo de Mantenimiento y tipos Lógico/Físico con meta semanal.
- 2026-11-24 · Normalización de la BD a minúsculas sin acentos, respaldo previo automático y migración idempotente.
- 2026-11-24 · Plan anual de mantenimiento generado desde el inventario: 3 rondas, 10 ordenes por semana y control para no duplicar el año.
- 2026-11-25 · Filtros y buscadores en Inventario, Tickets y Monitoreo; paginación, contadores, exportación y estados vacíos responden a los filtros.
- 2026-11-25 · El buscador visible se sustituye por una lupa flotante: sobre el botón «Nuevo ticket» en Tickets y en esa misma posición en los módulos sin botón de ticket.
- 2026-11-25 · Paleta verde de marca aplicada a navegación, botones, enlaces, lupa, foco y gráficas de agentes; estatus y alertas conservan sus colores semánticos.
- 2026-11-25 · Configuración reordenada en dos columnas equilibradas sin espacios vacíos; «Administración de accesos» ocupa todo el ancho y en móvil todo pasa a una columna.
- 2026-11-25 · El botón «Cerrar sesión» de Configuración usa el estilo rojo de peligro con icono de salida.
- 2026-11-25 · Paginación de usuarios (5 por página, con contador y flechas) y buscador instantáneo de usuarios en «Cambiar PIN», con selección por clic o Enter, cierre con Escape y búsqueda sin acentos.
- 2026-11-25 · Mantenimiento muestra una paginación por semana (inicia en la semana actual, con flechas, números y acceso rápido «Ir a la semana actual»); se quitaron «Visitas por equipo» y «Rondas al año» y se añadió el contador de órdenes pendientes de la semana.
- 2026-11-25 · En Mantenimiento, el responsable pasa a ser el técnico que realizó el servicio: se registra automáticamente al marcar una orden como completada, el campo se rotula «Técnico que realizó el mantenimiento» y el plan anual deja de preasignar al responsable del inventario.
- 2026-11-25 · Respaldo previo y limpieza de «Técnico» y «Observaciones» en las 732 órdenes de mantenimiento existentes; el plan anual deja ambos campos vacíos y la migración idempotente queda disponible como `npm run migrate:mantenimiento-limpio`.
- 2026-11-27 · Regeneración completa de la base con respaldo previo: 24 usuarios, 24 dispositivos, 122 equipos SGL, 2 016 métricas, 54 tickets y 272 mantenimientos; todo el uso arranca el lunes 23 de noviembre de 2026 y la semana actual conserva 10 órdenes sin técnico ni observaciones.
- 2026-11-27 · Simulador de agentes (`npm run demo:agentes`) para mantener 22 equipos en línea y 2 desconectados en el dashboard, sin levantar un segundo backend.
- 2026-11-27 · Logo `logo_app.png` integrado únicamente en la app: acceso, barra lateral, pantalla de carga y favicon; el reporte de estadía no usa el logo.
- 2026-11-27 · Reporte de estadía actualizado con topología física, topología lógica, tablas B.1/C.1, capturas reales de Anexo H, valores medidos en 4.3/4.4/4.5 y la URL `https://github.com/MarcoDianapoli/Estadias2026`; R-VIN-03-05 y carta de liberación quedan pendientes de los documentos escaneados.
- 2026-11-27 · Corrección final del alcance real en diagramas, tablas y texto del reporte: no se modificaron las conexiones; la red sigue en cascada de planta A → planta B → planta C (almacén). Solo se configuró una VLAN para almacén y el DHCP quedó en `148.202.3.100–.199` (100 direcciones). La fibra óptica, los enlaces troncales adicionales y la reconexión con nuevos equipos se dejaron para el siguiente año; la hipótesis original del Word se conservó sin cambios.
