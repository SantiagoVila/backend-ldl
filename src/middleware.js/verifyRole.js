// src/middleware/verifyRole.js

module.exports = (rolesPermitidos) => {
    // ✅ MEJORA: Aseguramos que 'rolesPermitidos' siempre sea un array.
    // Esto permite llamar a la función como verifyRole('admin') o verifyRole(['admin', 'dt']).
    const roles = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];

    return (req, res, next) => {
        const usuario = req.usuario;

        if (!usuario || !roles.includes(usuario.rol)) {
            return res.status(403).json({ message: "Acceso denegado: no tienes el rol requerido" });
        }

        next();
    };
};