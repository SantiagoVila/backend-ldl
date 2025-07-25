exports.generarQueriesActualizacionTabla = (partido) => {
  const { liga_id, equipo_local_id, equipo_visitante_id, goles_local, goles_visitante } = partido;

  const resultadoLocal = goles_local > goles_visitante ? 'G' : goles_local < goles_visitante ? 'P' : 'E';
  const resultadoVisitante = goles_local < goles_visitante ? 'G' : goles_local > goles_visitante ? 'P' : 'E';

  const queries = [];

  queries.push(`
    INSERT INTO tabla_posiciones (liga_id, equipo_id, jugados, ganados, empatados, perdidos, goles_favor, goles_contra, diferencia_goles, puntos)
    VALUES (${liga_id}, ${equipo_local_id}, 1, ${resultadoLocal === 'G' ? 1 : 0}, ${resultadoLocal === 'E' ? 1 : 0}, ${resultadoLocal === 'P' ? 1 : 0}, ${goles_local}, ${goles_visitante}, ${goles_local - goles_visitante}, ${resultadoLocal === 'G' ? 3 : resultadoLocal === 'E' ? 1 : 0})
    ON DUPLICATE KEY UPDATE
      jugados = jugados + 1,
      ganados = ganados + VALUES(ganados),
      empatados = empatados + VALUES(empatados),
      perdidos = perdidos + VALUES(perdidos),
      goles_favor = goles_favor + VALUES(goles_favor),
      goles_contra = goles_contra + VALUES(goles_contra),
      diferencia_goles = diferencia_goles + VALUES(diferencia_goles),
      puntos = puntos + VALUES(puntos)
  `);

  queries.push(`
    INSERT INTO tabla_posiciones (liga_id, equipo_id, jugados, ganados, empatados, perdidos, goles_favor, goles_contra, diferencia_goles, puntos)
    VALUES (${liga_id}, ${equipo_visitante_id}, 1, ${resultadoVisitante === 'G' ? 1 : 0}, ${resultadoVisitante === 'E' ? 1 : 0}, ${resultadoVisitante === 'P' ? 1 : 0}, ${goles_visitante}, ${goles_local}, ${goles_visitante - goles_local}, ${resultadoVisitante === 'G' ? 3 : resultadoVisitante === 'E' ? 1 : 0})
    ON DUPLICATE KEY UPDATE
      jugados = jugados + 1,
      ganados = ganados + VALUES(ganados),
      empatados = empatados + VALUES(empatados),
      perdidos = perdidos + VALUES(perdidos),
      goles_favor = goles_favor + VALUES(goles_favor),
      goles_contra = goles_contra + VALUES(goles_contra),
      diferencia_goles = diferencia_goles + VALUES(diferencia_goles),
      puntos = puntos + VALUES(puntos)
  `);

  return queries;
};