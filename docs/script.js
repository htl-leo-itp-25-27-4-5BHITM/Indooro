const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.nav-links');

function closeMenu() {
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Menü öffnen');
    navigation.classList.remove('is-open');
}

menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
    navigation.classList.toggle('is-open', open);
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
        closeMenu();
        menuButton.focus();
    }
});
window.matchMedia('(min-width: 601px)').addEventListener('change', closeMenu);
document.querySelector('#year').textContent = new Date().getFullYear();

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const revealTargets = document.querySelectorAll(
    '.hero-copy > *, .page-heading .eyebrow, .page-heading h1, .page-heading .section-lead, ' +
    '.phone, .overview-grid article, .benefits article, .steps li, .tech-details article, ' +
    '.system-flow > div, .project-heading, .project-story > p, .team, .project-facts, ' +
    '.section > .container > h2, .next-page .container'
);
const revealed = new WeakSet();
const entranceAnimations = new Set();
const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        revealObserver.unobserve(target);
        revealed.add(target);
        if (reducedMotion.matches || typeof target.animate !== 'function') return;
        const siblings = [...target.parentElement.children];
        const delay = Math.min(siblings.indexOf(target), 3) * 55;
        const animation = target.animate([
            { opacity: 0, transform: 'translateY(16px)' },
            { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 620, delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
        entranceAnimations.add(animation);
        animation.finished.catch(() => {}).finally(() => entranceAnimations.delete(animation));
    });
}, { threshold: 0.12 }) : null;

function observeEntrances() {
    if (reducedMotion.matches) return;
    revealTargets.forEach(target => {
        if (!revealed.has(target)) revealObserver?.observe(target);
    });
}
observeEntrances();
document.addEventListener('focusin', event => {
    entranceAnimations.forEach(animation => {
        if (animation.effect.target.contains(event.target)) animation.cancel();
    });
});

const header = document.querySelector('.site-header');
function updateHeader() {
    header.classList.toggle('is-scrolled', window.scrollY > 12);
}
window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();

const canvas = document.querySelector('#store-map');
const context = canvas?.getContext('2d');
let routeFrame = null;
let activeProduct;
// Fixed example routes illustrate the concept without connecting to live market data.
const products = {
    milk: { name: 'Hafermilch', aisle: 'Regal 3 · Milch & Alternativen', points: [[240, 408], [240, 330], [360, 330], [360, 165]] },
    apple: { name: 'Äpfel', aisle: 'Regal 1 · Obst & Gemüse', points: [[240, 408], [240, 330], [70, 330], [70, 165]] },
    bread: { name: 'Brot', aisle: 'Regal 2 · Brot & Gebäck', points: [[240, 408], [240, 330], [240, 165]] }
};

function drawMap(product, progress = 1) {
    if (!context) return;
    const ctx = context;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f7f8f7';
    ctx.fillRect(0, 0, 480, 460);
    ctx.strokeStyle = '#e2e6e2';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 22, 432, 416);
    [100, 270, 390].forEach((x, index) => {
        ctx.fillStyle = '#e2e8e2';
        ctx.fillRect(x, 85, 48, 190);
        ctx.fillStyle = '#a8b6a8';
        ctx.fillRect(x, 85, 48, 4);
        ctx.fillStyle = '#677367';
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(index + 1), x + 24, 65);
        ctx.strokeStyle = '#f7f8f7';
        for (let y = 120; y < 275; y += 38) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 48, y); ctx.stroke();
        }
    });
    ctx.strokeStyle = '#267449';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const lengths = product.points.slice(1).map(([x, y], index) => {
        const [startX, startY] = product.points[index];
        return Math.hypot(x - startX, y - startY);
    });
    let remaining = lengths.reduce((sum, length) => sum + length, 0) * progress;
    ctx.moveTo(...product.points[0]);
    for (let index = 0; index < lengths.length && remaining > 0; index++) {
        const [startX, startY] = product.points[index];
        const [endX, endY] = product.points[index + 1];
        const fraction = Math.min(remaining / lengths[index], 1);
        ctx.lineTo(startX + (endX - startX) * fraction, startY + (endY - startY) * fraction);
        remaining -= lengths[index];
    }
    ctx.stroke();
    ctx.fillStyle = '#267449';
    ctx.beginPath(); ctx.arc(240, 408, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'white'; ctx.lineWidth = 3; ctx.stroke();
    const [x, y] = product.points[product.points.length - 1];
    ctx.fillStyle = '#c7473f';
    ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#677367'; ctx.font = '16px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('EINGANG', 30, 413);
    canvas.setAttribute('aria-label', `Beispielgrundriss mit Route vom Eingang zu ${product.name}, ${product.aisle}`);
}

function showRoute(product) {
    cancelAnimationFrame(routeFrame);
    routeFrame = null;
    activeProduct = product;
    if (reducedMotion.matches || !context) {
        drawMap(product);
        return;
    }
    const start = performance.now();
    drawMap(product, 0);
    function frame(now) {
        const progress = Math.min((now - start) / 480, 1);
        drawMap(product, 1 - Math.pow(1 - progress, 3));
        routeFrame = progress < 1 ? requestAnimationFrame(frame) : null;
    }
    routeFrame = requestAnimationFrame(frame);
}

reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
        revealObserver?.disconnect();
        entranceAnimations.forEach(animation => animation.cancel());
        cancelAnimationFrame(routeFrame);
        routeFrame = null;
        if (activeProduct) drawMap(activeProduct);
    } else {
        observeEntrances();
    }
});

document.querySelectorAll('[data-product]').forEach(button => {
    button.addEventListener('click', () => {
        const product = products[button.dataset.product];
        document.querySelectorAll('[data-product]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        document.querySelector('#destination').textContent = product.name;
        document.querySelector('#aisle').textContent = product.aisle;
        showRoute(product);
    });
});
drawMap(products.milk);
