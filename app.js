const express = require('express');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // Las fotos se guardarán en una carpeta llamada 'uploads'
const app = express();
const PORT = process.env.PORT || 3000;
const nodemailer = require('nodemailer'); // Cargado solo una vez

// Configuración de las variables de entorno y Supabase
const transcriptor = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'manuelcabezasb1673@gmail.com',
    pass: 'ebtippfdzkonqeou' // Tu clave de aplicación de 16 letras
  }
});

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Base de datos temporal en memoria
let reportesMunicipales = [];

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 1. MOSTRAR EL PANEL (Formulario interactivo en pantalla)
app.get('/', (req, res) => {
    let filasTabla = reportesMunicipales.map(r => `
        <tr>
            <td style="padding:10px; border:1px solid #ddd;">${r.id}</td>
            <td style="padding:10px; border:1px solid #ddd; font-size:13px; color:#555;">${r.fechaHora}</td>
            <td style="padding:10px; border:1px solid #ddd;"><b>${r.tipo}</b></td>
            <td style="padding:10px; border:1px solid #ddd;">${r.sector}</td>
            <td style="padding:10px; border:1px solid #ddd;">${r.descripcion}</td>
            <td style="padding:10px; border:1px solid #ddd; color:orange;"><b>Pendiente</b></td>
        </tr>
    `).join('');

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Sistema de Reportes Comunales</title>
        </head>
        <body style="font-family:Arial, sans-serif; max-width:800px; margin:40px auto; padding:20px; background-color:#f9f9f9;">
            <h1 style="color:#2c3e50;">🏛️ Sistema de Reportes Comunales</h1>
            <p>Gestión Comunitaria de Incidencias de Infraestructura</p>
            <hr>
               
            <h3>Nuevo Reporte Vecinal (Anónimo)</h3>
            <form action="/registrar-incidencia" method="POST" enctype="multipart/form-data" style="background:white; padding:20px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                
                <label><b>Tipo de Incidencia:</b></label><br>
                <select name="tipo" style="width:100%; padding:8px; margin:8px 0; border-radius:4px; border:1px solid #ccc;">
                    <option value="Pavimentación y baches">Pavimentación y baches</option>
                    <option value="Alcantarillado y aguas servidas">Alcantarillado y aguas servidas</option>
                    <option value="Aseo y ornato">Aseo y ornato</option>
                    <option value="Alumbrado público">Alumbrado público</option>
                </select><br><br>

                <div style="margin-bottom: 15px;">
                    <label><b>¿Te encuentras en el lugar del incidente?</b></label><br>
                    <select id="ubicacionSwitch" onchange="alternarUbicacion()" style="width:100%; padding:8px; margin:8px 0; border-radius:4px; border:1px solid #ccc;">
                        <option value="si">Sí, capturar mi ubicación GPS actual</option>
                        <option value="no">No, reportar una dirección diferente</option>
                    </select>
                </div>

                <div id="capaDireccion" style="margin-bottom: 15px; display: none;">
                    <label><b>Dirección Exacta del Incidente (Calle, Número, Referencia):</b></label><br>
                    <input type="text" id="direccionManual" name="sector" placeholder="Ej: Calle Diego Portales 123, Coquimbo" style="width:100%; padding:8px; margin:8px 0; border-radius:4px; border:1px solid #ccc;">
                </div>

                <div id="capaGPS" style="margin-bottom: 15px;">
                    <p id="estado-gps" style="color:#7f8c8d; font-size:13px; font-style:italic; margin: 8px 0;">🌍 Esperando georreferenciación satelital...</p>
                    <div id="capaSectorGps">
                        <label><b>Referencia del Sector (Opcional):</b></label><br>
                        <input type="text" id="sectorGPS" name="sectorGPS" placeholder="Ej: Cerca de la plaza principal" style="width:100%; padding:8px; margin:8px 0; border-radius:4px; border:1px solid #ccc;">
                    </div>
                </div>

                <input type="hidden" id="latitud" name="latitud">
                <input type="hidden" id="longitud" name="longitud">

                <label><b>Descripción del problema:</b></label><br>
                <textarea name="descripcion" placeholder="Detalle la situación aquí..." required style="width:100%; padding:8px; margin:8px 0; height:80px; border-radius:4px; border:1px solid #ccc;"></textarea><br><br>

                <label><b>Evidencia Fotográfica:</b></label><br>
                <input type="file" name="foto" accept="image/*" capture="environment" style="width:100%; padding:8px; margin:8px 0;"><br><br>

                <button type="submit" style="background:#27ae60; color:white; padding:10px 20px; border:none; border-radius:4px; cursor:pointer; font-size:16px; font-weight:bold; width:100%;">Enviar Alerta a Central</button>
            </form>

            <script>
                function activarGPS() {
                    if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                            (posicion) => {
                                document.getElementById('latitud').value = posicion.coords.latitude;
                                document.getElementById('longitud').value = posicion.coords.longitude;
                                document.getElementById('estado-gps').innerHTML = "✅ Ubicación satelital GPS vinculada con éxito.";
                                document.getElementById('estado-gps').style.color = "#27ae60";
                            },
                            (error) => {
                                document.getElementById('estado-gps').innerHTML = "⚠️ GPS no disponible. Por favor elige la opción de escribir dirección.";
                                document.getElementById('estado-gps').style.color = "#c0392b";
                            }
                        );
                    }
                }

                activarGPS();

                function alternarUbicacion() {
                    var seleccion = document.getElementById("ubicacionSwitch").value;
                    var capaDireccion = document.getElementById("capaDireccion");
                    var capaGPS = document.getElementById("capaGPS");
                    var direccionManual = document.getElementById("direccionManual");

                    if (seleccion === "si") {
                        capaDireccion.style.display = "none";
                        capaGPS.style.display = "block";
                        direccionManual.required = false;
                        direccionManual.value = ""; 
                        activarGPS(); 
                    } else {
                        capaDireccion.style.display = "block";
                        capaGPS.style.display = "none";
                        direccionManual.required = true; 
                        document.getElementById('latitud').value = ""; 
                        document.getElementById('longitud').value = "";
                    }
                }
            </script>

            <br><hr><br>
            <h3>Historial de Reportes en la Comuna</h3>
            <table style="width:100%; border-collapse:collapse; background:white;">
                <tr style="background:#2c3e50; color:white;">
                    <th style="padding:10px; border:1px solid #ddd;">ID</th>
                    <th style="padding:10px; border:1px solid #ddd;">Fecha / Hora</th>
                    <th style="padding:10px; border:1px solid #ddd;">Tipo</th>
                    <th style="padding:10px; border:1px solid #ddd;">Sector / Dirección</th>
                    <th style="padding:10px; border:1px solid #ddd;">Descripción</th>
                    <th style="padding:10px; border:1px solid #ddd;">Estado</th>
                </tr>
                ${filasTabla.length > 0 ? filasTabla : '<tr><td colspan="6" style="text-align:center; padding:20px; color:#777;">No hay reportes ingresados aún.</td></tr>'}
            </table>
        </body>
        </html>
    `);
});

// 2. PROCESAR EL REPORTE CON FOTO, GPS Y ENVIAR EL CORREO
app.post('/registrar-incidencia', upload.single('foto'), async (req, res) => {
    let { tipo, sector, sectorGPS, descripcion, latitud, longitud } = req.body;
    const archivoFoto = req.file; 

    // 🕒 CAPTURA AUTOMÁTICA DE FECHA Y HORA EN CHILE
    const ahora = new Date();
    const fechaHoraChile = ahora.toLocaleString('es-CL', { timeZone: 'America/Santiago' });

    // Definir la ubicación final para consistencia de datos
    let ubicacionFinalEstadistica = sector;
    if (!ubicacionFinalEstadistica || ubicacionFinalEstadistica.trim() === "") {
        ubicacionFinalEstadistica = sectorGPS ? `Coordenadas GPS (${sectorGPS})` : "Coordenadas GPS";
    }

    const nombreArchivoFoto = archivoFoto ? archivoFoto.filename : 'sin-foto';

    // ☁️ GUARDAR REPORTE EN LA NUBE (SUPABASE)
    const { data, error } = await supabase
        .from('informes')
        .insert([
            { 
                descripcion: descripcion, 
                foto_url: nombreArchivoFoto,
                fecha: fechaHoraChile 
            }
        ])
        .select();

    if (error) {
        console.error('❌ Error al guardar en Supabase:', error.message);
    } else {
        console.log('✅ ¡Reporte guardado con éxito en la nube de Supabase!');
    }

    // Guardamos en la base de datos temporal local
    const nuevoReporte = {
        id: reportesMunicipales.length + 1,
        fechaHora: fechaHoraChile,
        tipo,
        sector: ubicacionFinalEstadistica,
        descripcion,
        latitud: latitud || null,
        longitud: longitud || null,
        foto: nombreArchivoFoto
    };
    reportesMunicipales.push(nuevoReporte);
    console.log(`📡 [${fechaHoraChile}] Procesando reporte N°${nuevoReporte.id}: ${tipo}`);

    // Lógica para armar el bloque de ubicación en el Correo
    let bloqueUbicacionCorreo = "";
    if (latitud && longitud && latitud !== "" && longitud !== "") {
        const linkGoogleMaps = `https://www.google.com/maps?q=${latitud},${longitud}`;
        bloqueUbicacionCorreo = `
            <p><strong>Ubicación:</strong> Detectada vía satélite (Vecino en terreno)</p>
            <p><strong>Referencia escrita:</strong> ${sectorGPS || "Ninguna"}</p>
            <br>
            <a href="${linkGoogleMaps}" target="_blank" style="background:#2980b9; color:white; padding:12px 20px; text-decoration:none; border-radius:4px; display:inline-block; font-weight:bold;">📍 VER UBICACIÓN EXACTA EN GOOGLE MAPS</a>
            <br>
        `;
    } else {
        bloqueUbicacionCorreo = `
            <p><strong>Ubicación / Dirección Reportada:</strong></p>
            <p style="font-size:16px; background:#f8f9fa; padding:12px; border-left:4px solid #2980b9; font-weight:bold;">🏠 ${sector}</p>
        `;
    }

    // 📧 DISPARAR CORREO HTML BIEN PRESENTABLE DESPUÉS DE QUE SE CREÓ "nuevoReporte"
    const opcionesCorreo = {
      from: 'manuelcabezasb1673@gmail.com',
      to: 'manuelcabezasb1673@gmail.com', 
      subject: `🚨 ¡Nueva Alerta Comunitaria! - ${nuevoReporte.tipo}`,
      html: `
        <div style="font-family:Arial, sans-serif; padding:20px; border:1px solid #ccc; border-radius:8px; max-width:600px;">
          <h2 style="color:#d35400;">⚠️ Alerta de Incidencia Recibida</h2>
          <hr>
          <p><strong>Tipo de problema:</strong> ${nuevoReporte.tipo}</p>
          <p><strong>Descripción:</strong> ${nuevoReporte.descripcion}</p>
          <p><strong>Fecha y Hora:</strong> ${nuevoReporte.fechaHora}</p>
          ${bloqueUbicacionCorreo}
          <br>
          <p style="color:#7f8c8d; font-size:12px;">Este correo se generó automáticamente desde el prototipo Reporte Ciudadano.</p>
        </div>
      `
    };

    transcriptor.sendMail(opcionesCorreo, (errorCorreo, info) => {
      if (errorCorreo) {
        console.log('❌ Error al enviar el correo:', errorCorreo);
      } else {
        console.log('📧 Correo de alerta enviado con éxito:', info.response);
      }
    });

    res.send(`
        <meta charset="UTF-8">
        <body style="font-family:Arial, sans-serif; text-align:center; padding:50px; background-color:#f9f9f9;">
            <div style="background:white; padding:30px; border-radius:8px; display:inline-block; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                <h2 style="color: #27ae60; margin-top:0;">¡Reporte Registrado con Éxito!</h2>
                <p>La información, la foto y los datos de ubicación geográfica fueron despachados a la central municipal.</p>
                <br>
                <a href="https://reporte-ciudadano-q7yn.onrender.com" style="display:inline-block; background:#2c3e50; color:white; padding:10px 20px; text-decoration:none; border-radius:4px; font-weight:bold;">Volver al Panel</a>
            </div>
        </body>
    `);
});

// Encendemos el motor
app.listen(PORT, () => {
    console.log("\n==================================================");
    console.log("🚀 Servidor de Alertas Comunales Iniciado con Éxito");
    console.log(`Corriendo en el puerto ${PORT}`);
    console.log("==================================================\n");
});