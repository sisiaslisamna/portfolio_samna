(() => {
    const stage  = document.getElementById('lanyard-stage');
    if (!stage) return;

    const canvas = document.getElementById('lanyard-canvas');
    const card   = document.getElementById('lanyard-card');
    const ctx    = canvas.getContext('2d');

    const SEGMENTS = 9;      // jumlah ruas tali
    const GRAVITY  = 0.55;
    const DAMPING  = 0.992;
    const ITER     = 14;     // iterasi constraint (makin besar makin kaku)

    let W = 0, H = 0, cardW = 0, cardH = 0, anchorY = -10;
    let pts = [], lens = [], last = 0, maxReach = 0;
    let dragging = false;
    const grab   = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };

    function build() {
        const rect = stage.getBoundingClientRect();
        const dpr  = window.devicePixelRatio || 1;

        W = rect.width;
        H = rect.height;
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        cardW = card.offsetWidth;
        cardH = card.offsetHeight;

        const ropeLen = Math.max(120, Math.min(H - cardH - 50, 260));
        const seg = ropeLen / SEGMENTS;

        pts = []; lens = [];
        for (let i = 0; i <= SEGMENTS + 1; i++) {
            const y = anchorY + (i <= SEGMENTS ? i * seg : SEGMENTS * seg + cardH / 2);
            const x = W / 2 + i * 0.4;
            pts.push({ x, y, px: x - (i > 0 ? 4 : 0), py: y });
        }
        for (let i = 0; i <= SEGMENTS; i++) {
            lens.push(i < SEGMENTS ? seg : cardH / 2);
        }
        last = pts.length - 1;
        maxReach = lens.reduce((a, b) => a + b, 0) - 2;
    }

    function simulate() {
        // Integrasi Verlet
        for (let i = 1; i < pts.length; i++) {
            const p = pts[i];
            const vx = (p.x - p.px) * DAMPING;
            const vy = (p.y - p.py) * DAMPING;
            p.px = p.x;
            p.py = p.y;
            p.x += vx;
            p.y += vy + GRAVITY;
        }

        // Saat ditarik, titik pusat kartu mengikuti pointer (kecepatan tetap tersimpan)
        if (dragging) {
            const p = pts[last];
            p.px = p.x;
            p.py = p.y;
            p.x = target.x;
            p.y = target.y;
        }

        // Constraint panjang antar titik
        for (let k = 0; k < ITER; k++) {
            pts[0].x = W / 2;
            pts[0].y = anchorY;

            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], b = pts[i + 1];
                const dx = b.x - a.x, dy = b.y - a.y;
                const d  = Math.hypot(dx, dy) || 0.0001;
                const diff = (d - lens[i]) / d;

                const wa = (i === 0 || (dragging && i === last)) ? 0 : 1;
                const wb = (dragging && i + 1 === last) ? 0 : 1;
                const total = wa + wb;
                if (!total) continue;

                a.x += dx * diff * (wa / total);
                a.y += dy * diff * (wa / total);
                b.x -= dx * diff * (wb / total);
                b.y -= dy * diff * (wb / total);
            }

            if (dragging) {
                pts[last].x = target.x;
                pts[last].y = target.y;
            }
        }
    }

    function drawRope() {
        ctx.clearRect(0, 0, W, H);
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c6f432';
        const n = SEGMENTS; // titik 0..n adalah tali

        const path = () => {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < n; i++) {
                const mx = (pts[i].x + pts[i + 1].x) / 2;
                const my = (pts[i].y + pts[i + 1].y) / 2;
                ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
            }
            ctx.lineTo(pts[n].x, pts[n].y);
        };

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Bayangan
        path();
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.lineWidth = 18;
        ctx.stroke();

        // Tali utama
        path();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 15;
        ctx.stroke();

        // Garis jahitan
        path();
        ctx.setLineDash([6, 8]);
        ctx.strokeStyle = 'rgba(20,22,10,.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function placeCard() {
        const top = pts[last - 1];
        const c   = pts[last];
        const angle = Math.atan2(-(c.x - top.x), c.y - top.y);
        card.style.transform =
            `translate(${c.x - cardW / 2}px, ${c.y - cardH / 2}px) rotate(${angle}rad)`;
    }

    function loop() {
        simulate();
        drawRope();
        placeCard();
        requestAnimationFrame(loop);
    }

    // ---------- Interaksi ----------
    function pointerPos(e) {
        const r = stage.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function updateTarget(e) {
        const p = pointerPos(e);
        let x = p.x - grab.x;
        let y = p.y - grab.y;

        // Batasi jangkauan sesuai panjang tali
        const dx = x - W / 2, dy = y - anchorY;
        const d = Math.hypot(dx, dy);
        if (d > maxReach) {
            x = W / 2 + (dx / d) * maxReach;
            y = anchorY + (dy / d) * maxReach;
        }
        target.x = x;
        target.y = y;
    }

    card.addEventListener('pointerdown', (e) => {
        dragging = true;
        card.setPointerCapture(e.pointerId);
        card.classList.add('is-dragging');

        const p = pointerPos(e);
        grab.x = p.x - pts[last].x;
        grab.y = p.y - pts[last].y;
        updateTarget(e);
    });

    card.addEventListener('pointermove', (e) => {
        if (dragging) updateTarget(e);
    });

    const release = () => {
        dragging = false;
        card.classList.remove('is-dragging');
    };
    card.addEventListener('pointerup', release);
    card.addEventListener('pointercancel', release);

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(build, 150);
    });

    build();
    loop();
})();