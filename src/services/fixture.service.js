// src/services/fixture.service.js

/**
 * Función auxiliar para generar una mini liga para los grupos.
 * @param {Array} equipos - Equipos del grupo.
 * @param {boolean} idaYVuelta - Si se deben generar partidos de vuelta.
 */
const generarMiniLiga = (equipos, idaYVuelta = false) => {
    const partidosIda = [];
    if (equipos.length < 2) return partidosIda;

    let equiposParaFixture = [...equipos];
    if (equiposParaFixture.length % 2 !== 0) {
        equiposParaFixture.push({ id: null, nombre: 'DESCANSO' });
    }
    const numEquipos = equiposParaFixture.length;
    const numJornadasIda = numEquipos - 1;

    for (let i = 0; i < numJornadasIda; i++) {
        for (let j = 0; j < numEquipos / 2; j++) {
            const local = equiposParaFixture[j];
            const visitante = equiposParaFixture[numEquipos - 1 - j];
            if (local.id !== null && visitante.id !== null) {
                partidosIda.push({ equipo_local_id: local.id, equipo_visitante_id: visitante.id, jornada: i + 1 });
            }
        }
        const ultimoEquipo = equiposParaFixture.pop();
        equiposParaFixture.splice(1, 0, ultimoEquipo);
    }

    if (!idaYVuelta) {
        return partidosIda;
    }

    const partidosVuelta = partidosIda.map(partido => ({
        equipo_local_id: partido.equipo_visitante_id,
        equipo_visitante_id: partido.equipo_local_id,
        jornada: partido.jornada + numJornadasIda
    }));

    return [...partidosIda, ...partidosVuelta];
};


/**
 * Función auxiliar para generar la llave de eliminación con reglas específicas.
 * @param {Array} equipos - Array de equipos (placeholders).
 */
const generarLlaveEliminatoriaConReglas = (equipos) => {
    const FASES = {
        8: { nombre: 'Cuartos de Final', idaYVuelta: true },
        4: { nombre: 'Semifinales', idaYVuelta: true },
        2: { nombre: 'Final', idaYVuelta: false } // La final es a partido único
    };

    let todosLosPartidos = [];
    let equiposEnRonda = [...equipos];
    let idPartidoLlaveGlobal = 1;
    let partidosEnFaseAnterior = 0;

    while (equiposEnRonda.length >= 2) {
        const faseConfig = FASES[equiposEnRonda.length];
        if (!faseConfig) break;

        const partidosDeFase = [];
        const equiposSiguienteRonda = [];
        const numLlavesEnRonda = equiposEnRonda.length / 2;

        for (let i = 0; i < equiposEnRonda.length; i += 2) {
            const local = equiposEnRonda[i];
            const visitante = equiposEnRonda[i + 1];

            // Calculamos el ID de la llave del siguiente partido
            const idSiguienteLlave = faseConfig.nombre !== 'Final' 
                ? numLlavesEnRonda + Math.floor((idPartidoLlaveGlobal - partidosEnFaseAnterior - 1) / 2) + 1
                : null;

            // Partido de Ida
            partidosDeFase.push({
                equipo_local_id: null,
                equipo_visitante_id: null,
                fase: faseConfig.nombre,
                id_partido_llave: idPartidoLlaveGlobal,
                id_siguiente_partido_llave: idSiguienteLlave
            });
            
            // Si es ida y vuelta, se crea el segundo partido
            if (faseConfig.idaYVuelta) {
                partidosDeFase.push({
                    equipo_local_id: null,
                    equipo_visitante_id: null,
                    fase: faseConfig.nombre,
                    id_partido_llave: idPartidoLlaveGlobal, // Mismo ID de llave para agruparlos
                    id_siguiente_partido_llave: idSiguienteLlave
                });
            }
            
            equiposSiguienteRonda.push({ id: `GANADOR_LLAVE_${idPartidoLlaveGlobal}` });
            idPartidoLlaveGlobal++;
        }
        
        partidosEnFaseAnterior += numLlavesEnRonda;
        todosLosPartidos.push(...partidosDeFase);
        equiposEnRonda = equiposSiguienteRonda;
    }

    return todosLosPartidos;
};


/**
 * Genera un calendario de partidos de todos contra todos a IDA Y VUELTA para Ligas.
 */
exports.generarPartidosRoundRobin = (equipos) => {
    return generarMiniLiga(equipos, true);
};


/**
 * Genera un fixture de copa con fase de grupos (ida y vuelta) y eliminatorias (ida y vuelta excepto la final).
 */
exports.generarCopaConGrupos = (equipos, equiposPorGrupo = 6) => {
    if (equipos.length % 2 !== 0 || equipos.length < 4) {
        throw new Error("El número de equipos debe ser par y al menos 4.");
    }

    // 1. Mezclar y dividir equipos en dos grupos
    const equiposMezclados = [...equipos].sort(() => Math.random() - 0.5);
    const grupo1 = equiposMezclados.slice(0, equiposPorGrupo);
    const grupo2 = equiposMezclados.slice(equiposPorGrupo);

    // 2. Generar partidos de la fase de grupos (ida y vuelta)
    const partidosGrupo1 = generarMiniLiga(grupo1, true).map(p => ({ ...p, grupo_id: 1, fase: 'Grupos' }));
    const partidosGrupo2 = generarMiniLiga(grupo2, true).map(p => ({ ...p, grupo_id: 2, fase: 'Grupos' }));
    const partidosDeGrupos = [...partidosGrupo1, ...partidosGrupo2];
    
    // 3. Generar la llave de eliminación con las nuevas reglas
    // Asumimos 8 clasificados (4 por grupo)
    const equiposPlaceholder = new Array(8).fill({ id: null }); 
    const partidosEliminatoria = generarLlaveEliminatoriaConReglas(equiposPlaceholder);

    return {
        grupos: { 1: grupo1, 2: grupo2 },
        partidos: [...partidosDeGrupos, ...partidosEliminatoria]
    };
};
