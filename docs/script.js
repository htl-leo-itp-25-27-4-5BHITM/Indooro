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
const revealSelector =
    '.hero-copy > *, .page-heading .eyebrow, .page-heading h1, .page-heading .section-lead, ' +
    '.phone, .overview-grid article, .benefits article, .steps li, .tech-details article, ' +
    '.system-flow > div, .project-heading, .project-story > p, .team, .project-facts, ' +
    '.section > .container > h2, .next-page .container';
let revealed = new WeakSet();
const entranceAnimations = new Set();
const pendingEntrances = new Map();
const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting || !target.isConnected) return;
        revealObserver.unobserve(target);
        revealed.add(target);
        const animation = pendingEntrances.get(target);
        if (!animation) return;
        if (reducedMotion.matches || target.contains(document.activeElement)) animation.cancel();
        else animation.play();
    });
}, { threshold: 0, rootMargin: '0px 0px 64px 0px' }) : null;

function observeEntrances() {
    if (reducedMotion.matches || !revealObserver) return;
    document.querySelectorAll(revealSelector).forEach(target => {
        if (revealed.has(target) || pendingEntrances.has(target)) return;
        // Never reset an element that is already visible; prepare below-viewport entries before scrolling.
        if (target.getBoundingClientRect().top < window.innerHeight || typeof target.animate !== 'function') {
            revealed.add(target);
            return;
        }
        const siblings = [...target.parentElement.children];
        const delay = Math.min(siblings.indexOf(target), 3) * 40;
        const animation = target.animate([
            { opacity: 0, transform: 'translateY(12px)' },
            { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 550, delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' });
        animation.pause();
        animation.currentTime = 0;
        pendingEntrances.set(target, animation);
        entranceAnimations.add(animation);
        animation.finished.catch(() => {}).finally(() => {
            if (pendingEntrances.get(target) === animation) pendingEntrances.delete(target);
            entranceAnimations.delete(animation);
            animation.cancel();
        });
        revealObserver.observe(target);
    });
}
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

let canvas;
let context;
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
        pendingEntrances.clear();
        cancelAnimationFrame(routeFrame);
        routeFrame = null;
        if (activeProduct) drawMap(activeProduct);
    } else {
        observeEntrances();
    }
});

document.addEventListener('click', event => {
    const button = event.target.closest('[data-product]');
    if (!button) return;
    const product = products[button.dataset.product];
    document.querySelectorAll('[data-product]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    document.querySelector('#destination').textContent = product.name;
    document.querySelector('#aisle').textContent = product.aisle;
    showRoute(product);
});

const main = document.querySelector('#inhalt');
const homeContent = document.createDocumentFragment();
homeContent.append(...main.childNodes);
const views = new Map([['start', {
    content: homeContent,
    title: document.title,
    description: document.querySelector('meta[name="description"]').content
}]]);
document.querySelectorAll('template[data-view]').forEach(template => {
    views.set(template.dataset.view, {
        content: template.content,
        title: template.dataset.title,
        description: template.dataset.description
    });
    template.remove();
});
const scrollPositions = new Map();
let currentView;
let currentHash;
let linkNavigation = false;
history.scrollRestoration = 'manual';

function readRoute() {
    if (!location.hash || location.hash === '#') return { view: 'start', anchor: '' };
    if (!location.hash.startsWith('#/')) {
        return { view: currentView || 'start', anchor: location.hash.slice(1) };
    }
    const [name, anchor = ''] = location.hash.slice(2).split('/');
    const view = name || 'start';
    if (!views.has(view)) {
        history.replaceState(history.state, '', '#/');
        return { view: 'start', anchor: '' };
    }
    return { view, anchor };
}

function initializePreview() {
    canvas = main.querySelector('#store-map');
    context = canvas?.getContext('2d');
    const selected = main.querySelector('[data-product][aria-pressed="true"]');
    activeProduct = selected ? products[selected.dataset.product] : null;
    if (activeProduct) drawMap(activeProduct);
}

function renderRoute({ initial = false, restoreScroll = true } = {}) {
    const route = readRoute();
    if (currentHash !== undefined) scrollPositions.set(currentHash, window.scrollY);
    const viewChanged = currentView !== route.view;
    if (viewChanged) {
        revealObserver?.disconnect();
        entranceAnimations.forEach(animation => animation.cancel());
        pendingEntrances.clear();
        revealed = new WeakSet();
        cancelAnimationFrame(routeFrame);
        routeFrame = null;
        // Retain each detached view so product selections and open FAQs survive navigation.
        if (currentView) views.get(currentView).content.append(...main.childNodes);
        const view = views.get(route.view);
        main.replaceChildren(view.content);
        main.dataset.view = route.view;
        currentView = route.view;
        document.title = view.title;
        document.querySelector('meta[name="description"]').content = view.description;
        document.querySelector('meta[property="og:title"]').content = view.title;
        document.querySelector('meta[property="og:description"]').content = view.description;
        initializePreview();
    }
    document.querySelectorAll('.nav-links a, .footer-layout nav a').forEach(link => {
        const active = link.getAttribute('href') === `#/${route.view === 'start' ? '' : route.view}`;
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
    closeMenu();
    currentHash = location.hash || '#/';
    const anchor = route.anchor ? main.querySelector(`#${CSS.escape(route.anchor)}`) : null;
    if (anchor) anchor.scrollIntoView({ behavior: 'instant', block: 'start' });
    else window.scrollTo({ top: restoreScroll ? scrollPositions.get(currentHash) || 0 : 0, behavior: 'instant' });
    if (!initial) {
        const focusTarget = anchor || main.querySelector('h1');
        focusTarget?.setAttribute('tabindex', '-1');
        focusTarget?.focus({ preventScroll: true });
    }
    updateHeader();
    observeEntrances();
    if (viewChanged && !initial && !reducedMotion.matches && typeof main.animate === 'function') {
        const animation = main.animate([{ opacity: 0.8 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
        entranceAnimations.add(animation);
        animation.finished.catch(() => {}).finally(() => entranceAnimations.delete(animation));
    }
}

document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target === '_blank') return;
    const href = link.getAttribute('href');
    if (href === '#inhalt') {
        event.preventDefault();
        main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
        main.scrollIntoView({ behavior: 'instant', block: 'start' });
    } else if (href.startsWith('#/')) {
        event.preventDefault();
        if (location.hash === href) renderRoute({ restoreScroll: false });
        else {
            linkNavigation = true;
            location.hash = href;
        }
    }
});
window.addEventListener('hashchange', () => {
    renderRoute({ restoreScroll: !linkNavigation });
    linkNavigation = false;
});
renderRoute({ initial: true });
