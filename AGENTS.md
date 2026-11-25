<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Reglas del Usuario

1. **Aprobación de Planes**: El usuario debe aprobar explícitamente todos los planes de implementación antes de que el agente ejecute cualquier cambio en el código.
2. **Ejecución Autónoma Post-Aprobación**: Una vez que el usuario revise y autorice un plan de implementación, no es necesario detenerse para pedir autorización para ejecutar comandos ni códigos; el agente debe continuar de forma autónoma sin interrupciones hasta terminar de implementar por completo el plan autorizado.
3. **Despliegues a Producción**: El agente solo debe realizar despliegues a producción cuando el usuario lo indique explícitamente.
