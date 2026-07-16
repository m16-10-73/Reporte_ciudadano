require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js'); // O '@supabase/supabase-js' según tu package.json

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuración local temporal para Multer (recibe la foto antes de mandarla a Supabase)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, 'foto-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Para servir tu HTML principal
app.use('/uploads', express.static('uploads'));

// ==========================================
// 🚀 1. REGISTRAR INCIDENCIA (VECINO SUBE REPORTE)
// ==========================================
app.post('/registrar-incidencia', upload.single('foto'), async (req, res) => {
    const { tipo, sector, sectorGPS, descripcion, latitud, longitud, nombre, telefono, email } = req.body;
    const archivoFoto = req.file;

    // Capturar fecha y hora exacta en Chile
    const ahora = new Date();
    const fechaHoraChile = ahora.toLocaleString('es-CL', { timeZone: 'America/Santiago' });

    let ubicacionFinal = sector;
    if (!ubicacionFinal || ubicacionFinal.trim() === "") {
        ubicacionFinal = sectorGPS ? `GPS: ${sectorGPS}` : "Coordenadas GPS";
    }

    let urlPublicaFoto = null;

    try {
        // Subir foto al Storage de Supabase si existe
        if (archivoFoto) {
            const rutaArchivoLocal = archivoFoto.path;
            const nombreArchivoEnNube = `${Date.now()}-${archivoFoto.filename}`;
            const bufferArchivo = fs.readFileSync(rutaArchivoLocal);

            console.log('☁️ Subiendo foto al Storage de Supabase...');
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('fotos-reportes')
                .upload(nombreArchivoEnNube, bufferArchivo, {
                    contentType: archivoFoto.mimetype,
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) {
                console.error('❌ Error al subir imagen al Storage:', uploadError.message);
            } else {
                // Obtener la URL pública de la foto recién subida
                const { data: urlData } = supabase.storage
                    .from('fotos-reportes')
                    .getPublicUrl(nombreArchivoEnNube);

                urlPublicaFoto = urlData.publicUrl;
                console.log('✅ Foto subida exitosamente. URL:', urlPublicaFoto);
            }

            // Limpiar el archivo local del servidor Render para no acumular basura
            fs.unlinkSync(rutaArchivoLocal);
        }

        // Insertar datos en la tabla de Supabase (respetando tus columnas exactas)
        console.log('☁️ Guardando datos del reporte en la tabla de Supabase...');
        const { error: insertError } = await supabase
            .from('informes')
            .insert([
                {
                    descripcion: descripcion,
                    tipo: tipo,
                    sector: ubicacionFinal,
                    latitud: latitud || null,
                    longitud: longitud || null,
                    foto_url: urlPublicaFoto || 'sin-foto',
                    fecha: fechaHoraChile,
                    Estado: 'Pendiente', // Tu columna con "E" mayúscula
                    Nombre_de_quien_reporta: nombre || 'Anónimo', // Tu columna
                    Teléfono: telefono || null, // Tu columna con tilde
                    email: email || null // Tu columna
                }
            ]);

        if (insertError) {
            throw insertError;
        }

        console.log('✅ ¡Todo guardado con éxito!');

        // Enviar pantalla de éxito al vecino de inmediato
        res.send(`
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <body style="font-family:Arial, sans-serif; text-align:center; padding:50px; background-color:#f4f6f7;">
                <div style="background:white; padding:40px; border-radius:12px; display:inline-block; box-shadow:0 4px 15px rgba(0,0,0,0.1); max-width:500px;">
                    <div style="font-size: 60px; color: #2ecc71;">✓</div>
                    <h2 style="color: #2c3e50; margin-top:10px;">¡Reporte Enviado con Éxito!</h2>
                    <p style="color: #7f8c8d; line-height: 1.5;">Hola <strong>${nombre}</strong>, tu reporte sobre <strong>${tipo}</strong> ha sido registrado en nuestro sistema municipal bajo el estado <strong>Pendiente</strong>.</p>
                    <p style="color: #7f8c8d; font-size:14px;">La municipalidad ya puede visualizar tu alerta.</p>
                    <br>
                    <a href="/" style="display:inline-block; background:#2980b9; color:white; padding:12px 25px; text-decoration:none; border-radius:6px; font-weight:bold;">Registrar Otro Reporte</a>
                    <a href="/ver-reportes" style="display:inline-block; background:#2c3e50; color:white; padding:12px 25px; text-decoration:none; border-radius:6px; font-weight:bold; margin-left:10px;">Ver mis reportes</a>
                </div>
            </body>
        `);

    } catch (error) {
        console.error('❌ Error en el flujo:', error.message);
        res.status(500).send('Ocurrió un error al procesar el reporte.');
    }
});

// ==========================================
// 👥 2. VISTA PÚBLICA (EL CIUDADANO VE SUS REPORTES)
// ==========================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 👮 3. VISTA DEL ADMINISTRADOR MUNICIPAL
// ==========================================
app.get('/admin', async (req, res) => {
    try {
        const { data: reportes, error } = await supabase
            .from('informes')
            .select('*')
            .order('id', { ascending: false });

        if (error) throw error;

        let filasTabla = '';
        reportes.forEach(rep => {
            const imagenHTML = rep.foto_url && rep.foto_url !== 'sin-foto'
                ? `<a href="${rep.foto_url}" target="_blank"><img src="${rep.foto_url}" style="width:70px; height:70px; object-fit:cover; border-radius:6px; border:1px solid #ccc;"></a>`
                : '<span style="color:#aaa;">Sin foto</span>';

            // Marcador de selección para los estados
            const selectEstado = `
                <select onchange="cambiarEstado(${rep.id}, this.value)" style="padding:8px; border-radius:4px; font-weight:bold; border:1px solid #ccc; background:#fff; cursor:pointer;">
                    <option value="Pendiente" ${rep.Estado === 'Pendiente' ? 'selected' : ''} style="color:black;">🟡 Pendiente</option>
                    <option value="En Proceso" ${rep.Estado === 'En Proceso' ? 'selected' : ''} style="color:black;">🔵 En Proceso</option>
                    <option value="Solucionado" ${rep.Estado === 'Solucionado' ? 'selected' : ''} style="color:black;">🟢 Solucionado</option>
                </select>
            `;

            filasTabla += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:12px;">${rep.id}</td>
                    <td style="padding:12px;">${rep.fecha || ''}</td>
                    <td style="padding:12px; font-weight:bold; color:#e67e22;">${rep.tipo || ''}</td>
                    <td style="padding:12px;">${rep.sector || ''}</td>
                    <td style="padding:12px;">
                        <strong>${rep.Nombre_de_quien_reporta || 'Anónimo'}</strong><br>
                        <span style="font-size:12px; color:#7f8c8d;">
                            📞 ${rep.Teléfono || 'Sin Teléfono'}<br>
                            ✉️ ${rep.email || 'Sin Email'}
                        </span>
                    </td>
                    <td style="padding:12px;">${rep.descripcion || ''}</td>
                    <td style="padding:12px; text-align:center;">${imagenHTML}</td>
                    <td style="padding:12px; text-align:center;">${selectEstado}</td>
                </tr>
            `;
        });

        res.send(`
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Panel de Control Municipal - Reporte Ciudadano</title>
            <body style="font-family:Arial, sans-serif; background:#2c3e50; padding:25px; margin:0; color:#333;">
                <div style="max-width:1300px; margin:0 auto; background:white; padding:30px; border-radius:12px; box-shadow:0 10px 25px rgba(0,0,0,0.3);">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #e67e22; padding-bottom:15px; margin-bottom:20px;">
                        <h1 style="margin:0; color:#2c3e50;">👮 Panel de Control - Administración Municipal</h1>
                        <span style="background:#e67e22; color:white; padding:8px 15px; border-radius:20px; font-weight:bold; font-size:14px;">Central Coquimbo</span>
                    </div>

                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; min-width:900px;">
                            <thead>
                                <tr style="background:#34495e; color:white; text-align:left;">
                                    <th style="padding:12px; width:50px;">ID</th>
                                    <th style="padding:12px;">Fecha</th>
                                    <th style="padding:12px;">Incidencia</th>
                                    <th style="padding:12px;">Sector</th>
                                    <th style="padding:12px;">Denunciante</th>
                                    <th style="padding:12px;">Descripción</th>
                                    <th style="padding:12px; text-align:center;">Foto</th>
                                    <th style="padding:12px; text-align:center;">Cambiar Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filasTabla || '<tr><td colspan="8" style="padding:20px; text-align:center; color:#95a5a6;">No hay registros pendientes.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                <script>
                    async function cambiarEstado(id, nuevoEstado) {
                        try {
                            const respuesta = await fetch('/actualizar-estado', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id, estado: nuevoEstado })
                            });
                            
                            const resultado = await respuesta.json();
                            if (resultado.success) {
                                alert("Estado del reporte #" + id + " actualizado correctamente a: " + nuevoEstado);
                            } else {
                                alert("Error al guardar los cambios: " + resultado.error);
                            }
                        } catch (error) {
                            alert("Error de conexión al intentar cambiar el estado.");
                        }
                    }
                </script>
            </body>
        `);
    } catch (err) {
        res.status(500).send("Error al cargar el panel de administración.");
    }
});

// ==========================================
// 🔄 4. ACTUALIZAR ESTADO (PETICIÓN INTERNA DEL ADMIN)
// ==========================================
app.post('/actualizar-estado', async (req, res) => {
    const { id, estado } = req.body;

    try {
        const { error } = await supabase
            .from('informes')
            .update({ Estado: estado }) // Tu columna con "E" mayúscula
            .eq('id', id);

        if (error) throw error;

        console.log(`🔄 Reporte #${id} actualizado a [${estado}]`);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ Error al actualizar estado:", err.message);
        res.json({ success: false, error: err.message });
    }
});
// Ruta para que el Panel Municipal pueda LEER todos los reportes de Supabase
app.get('/reportes', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('informes') // <--- ¡Aquí cambiamos 'reportes' por 'informes'!
            .select('*')
            .order('created_at', { ascending: false }); // <-- ESTA LÍNEA ORDENA DE NUEVO A ANTIGUO

        if (error) throw error;
        
        res.json(data);
    } catch (err) {
        console.error("Error al obtener reportes:", err);
        res.status(500).json({ error: err.message });
    }
});
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor iniciado en el puerto: ${PORT}`);
});