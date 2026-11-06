/*
 * ringsph-gen.js — Generador de esfera por anillos para Blockbench
 * ---------------------------------------------------------------
 * Genera una esfera formada por anillos concéntricos de cubos/paneles.
 *
 * Garantías del generador:
 *  1. Cada cubo/panel queda EXACTAMENTE a la misma distancia "radio"
 *     del punto de pivote elegido por el usuario (el centro de cada
 *     cubo describe una esfera perfecta).
 *  2. El tamaño de cada elemento es controlable por el usuario en los
 *     3 ejes (ancho X, alto Y, profundidad Z). Con profundidad pequeña
 *     (p. ej. 0.1–0.25) se obtienen paneles; con valores iguales, cubos.
 *  3. El usuario controla el pivote (centro de la esfera) y el radio.
 *  4. La esfera se construye por anillos de latitud (polo +Y → polo −Y).
 *  5/6. Se respeta el sistema de rotación de Blockbench: la rotación de
 *     cada cubo se aplica alrededor de su "origin" (pivote del cubo),
 *     que se fija en el centro de la esfera.
 *  7. Cada cubo rota lo justo: su eje local Z (la profundidad) apunta
 *     exactamente hacia afuera de la esfera, de modo que las caras
 *     quedan tangentes a la superficie.
 *
 * SIN HUECOS (técnica de solapamiento — v1.1.0):
 *  - El número de cubos por anillo y el número de anillos se calculan
 *    con redondeo HACIA ARRIBA (ceil): la separación entre centros nunca
 *    supera el tamaño del panel, así que el hueco geométrico es ≤ 0
 *    (antes, con round(), podía llegar a +50% del tamaño del cubo).
 *  - Además se aplica un SOLAPAMIENTO configurable (por defecto 10%,
 *    inspirado en los modelos de referencia tipo "boobs.json", donde los
 *    anillos de paneles se montan con ~+0.13 a +0.21 unidades de
 *    superposición sobre paneles de 1×1). Esto elimina los huecos en
 *    forma de cuña que aparecen entre paneles planos y la superficie
 *    curva de la esfera, incluso en los polos y con paneles muy planos.
 *  - La expansión por solapamiento es simétrica (crece hacia ambos
 *    lados), por lo que el centro del panel no se desplaza: sigue a
 *    distancia exacta "radio" del pivote.
 *
 * Notas sobre la rotación:
 *  - Blockbench aplica las rotaciones [x, y, z] alrededor del origin del
 *    cubo en el orden X → Y → Z (ejes globales), equivalente a la matriz
 *    Ry(θ)·Rx(φ). Con rotation = [φ−90°, θ, 0] y el cubo colocado sin
 *    rotar a distancia R en +Z del pivote, el centro acaba exactamente en
 *    la posición radial y el eje Z local apunta radialmente hacia afuera.
 *  - Si tu versión de Blockbench compone los ejes en otro orden y la
 *    esfera sale espejada, cambia el signo de thetaDeg en la línea
 *    marcada con "SIGNO-THETA" más abajo.
 *  - Las rotaciones arbitrarias (±90° y dos ejes a la vez) son válidas
 *    para modelos de entidad (Java/Bedrock). Para modelos de bloque de
 *    Minecraft Java (rotación limitada a múltiplos de 22.5° y ±45° en un
 *    solo eje) activa la casilla de ajuste a 22.5°, sabiendo que la
 *    tangencia exacta se perderá ligeramente.
 */

(function () {
    'use strict';

    var ID = 'ringsph-gen';
    var accion = null;

    Plugin.register(ID, {
        title: 'Generador de esfera por anillos (ringsph-gen)',
        author: 'Generado con asistencia de IA',
        description: 'Genera una esfera de anillos de cubos/paneles. Todos los elementos quedan a la misma distancia del pivote, rotan lo justo para ser tangentes, y se solapan entre sí para no dejar huecos.',
        icon: 'bubble_chart',
        version: '1.1.0',
        variant: 'both',
        tags: ['Minecraft: Java Edition', 'Minecraft: Bedrock Edition'],
        onload: function () {
            accion = new Action(ID + '_abrir', {
                name: 'Generar esfera por anillos',
                description: 'Abre el generador de esferas concéntricas de cubos/paneles',
                icon: 'bubble_chart',
                click: function () { abrirDialogo(); }
            });
            MenuBar.addAction(accion, 'tools');
        },
        onunload: function () {
            if (accion) accion.delete();
            MenuBar.removeAction('tools.' + ID + '_abrir');
        }
    });

    function abrirDialogo() {
        // Punto de pivote por defecto: el origin del elemento seleccionado, o 0,0,0
        var px = 0, py = 0, pz = 0;
        if (typeof Project !== 'undefined' && Project.selected_elements && Project.selected_elements.length) {
            var o = Project.selected_elements[0].origin || [0, 0, 0];
            px = o[0]; py = o[1]; pz = o[2];
        }

        new Dialog({
            id: ID + '_dialog',
            title: 'Generador de esfera por anillos',
            width: 460,
            form: {
                radio:    { label: 'Radio de la esfera (distancia al pivote)', type: 'number', value: 8, min: 0.5, step: 0.5 },
                ancho:    { label: 'Ancho del cubo/panel (eje local X)', type: 'number', value: 1, min: 0.01, step: 0.5 },
                alto:     { label: 'Alto del cubo/panel (eje local Y)', type: 'number', value: 1, min: 0.01, step: 0.5 },
                profundo: { label: 'Profundidad (eje local Z) — 0.1 a 0.25 para paneles', type: 'number', value: 1, min: 0.01, step: 0.25 },
                px:       { label: 'Pivote de la esfera — X', type: 'number', value: px, step: 0.5 },
                py:       { label: 'Pivote de la esfera — Y', type: 'number', value: py, step: 0.5 },
                pz:       { label: 'Pivote de la esfera — Z', type: 'number', value: pz, step: 0.5 },
                anillos:  { label: 'Número de anillos (0 = automático según el alto)', type: 'number', value: 0, min: 0, max: 512, step: 1 },
                hueco:    { label: 'Separación entre cubos (1 = tangentes)', type: 'number', value: 1, min: 0.5, max: 2, step: 0.05 },
                solapa:   { label: 'Solapamiento anti-huecos (%)', type: 'number', value: 10, min: 0, max: 100, step: 5 },
                snap225:  { label: 'Ajustar rotaciones a múltiplos de 22.5° (regla de Minecraft)', type: 'checkbox', value: false }
            },
            onConfirm: function (result) { generarEsfera(result); }
        }).show();
    }

    function generarEsfera(f) {
        var R     = Math.max(0.5, Number(f.radio) || 8);
        var w     = Math.max(0.01, Number(f.ancho) || 1);   // ancho  (X local)
        var h     = Math.max(0.01, Number(f.alto) || 1);    // alto   (Y local)
        var d     = Math.max(0.01, Number(f.profundo) || 1);// profund(Z local, hacia afuera de la esfera)
        var px    = Number(f.px) || 0;
        var py    = Number(f.py) || 0;
        var pz    = Number(f.pz) || 0;
        var hueco = Math.max(0.5, Number(f.hueco) || 1);
        // Solapamiento: los paneles se expanden un % en ancho y alto.
        // Así cubren la curvatura de la esfera y los huecos quedan ≤ 0.
        var solapa = Math.min(1, Math.max(0, (Number(f.solapa) || 0) / 100));
        var snap  = !!f.snap225;

        function ajustarAngulo(a) {
            // Regla de rotación de Minecraft: solo múltiplos de 22.5°
            return snap ? Math.round(a / 22.5) * 22.5
                        : Math.round(a * 1000) / 1000;
        }

        // Dimensiones EFECTIVAS (con solapamiento). La expansión es simétrica,
        // así que el centro no se mueve y sigue a distancia R del pivote.
        var wEf = w * (1 + solapa);
        var hEf = h * (1 + solapa);

        // Nº de anillos: CEIL para que el arco vertical ≤ alto del cubo.
        // Con round() el hueco podía llegar a ~50% del tamaño; con ceil es ≤ 0.
        var nAnillos = parseInt(f.anillos, 10);
        if (!(nAnillos >= 2)) {
            nAnillos = Math.max(2, Math.ceil(Math.PI * R / (h * hueco)));
            nAnillos = Math.min(nAnillos, 512);
        }

        var grupo = new Group({ name: 'esfera_r' + R }).init();
        var cubos = [];

        Undo.initEdit({ outliner: true, elements: [] });

        // Anillos de latitud: i = 0 (polo +Y) … i = nAnillos (polo −Y), φ ∈ [0, π]
        for (var i = 0; i <= nAnillos; i++) {
            var phi    = Math.PI * i / nAnillos;
            var sinPhi = Math.sin(phi);
            var phiDeg = ajustarAngulo(phi * 180 / Math.PI - 90);

            // Cubos por anillo: CEIL para que la cuerda ≤ ancho del cubo.
            var n = 1;
            if (sinPhi > 1e-6) {
                n = Math.max(3, Math.ceil(2 * Math.PI * R * sinPhi / (w * hueco)));
            }

            for (var j = 0; j < n; j++) {
                var theta    = 2 * Math.PI * j / n;
                var thetaDeg = ajustarAngulo(theta * 180 / Math.PI); // ← SIGNO-THETA

                // Centro del cubo SIN rotar: exactamente a distancia R del pivote en +Z.
                // Con rotation = [φ−90°, θ, 0] aplicada alrededor del origin (el pivote
                // de la esfera), el centro acaba en la posición radial deseada y el eje
                // Z local (profundidad) queda apuntando hacia afuera, tangente a la esfera.
                var cx = px, cy = py, cz = pz + R;

                var cubo = new Cube({
                    name:     'anillo_' + i + '_cubo_' + j,
                    // Se usa wEf/hEf: los paneles crecen simétricamente y
                    // SOLAPAN al vecino, sellando los huecos de curvatura.
                    from:     [cx - wEf / 2, cy - hEf / 2, cz - d / 2],
                    to:       [cx + wEf / 2, cy + hEf / 2, cz + d / 2],
                    origin:   [px, py, pz],     // pivote de rotación = centro de la esfera
                    rotation: [phiDeg, thetaDeg, 0]
                });
                cubo.addTo(grupo).init();
                cubos.push(cubo);
            }
        }

        Undo.finishEdit('Generar esfera por anillos', { outliner: true, elements: cubos });
        Canvas.updateAll();
        updateSelection();
        Blockbench.showQuickMessage('Esfera generada: ' + cubos.length + ' elementos en ' + (nAnillos + 1) + ' anillos.', 4000);
    }
})();
