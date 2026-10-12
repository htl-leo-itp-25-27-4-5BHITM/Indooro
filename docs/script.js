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

const canvas = document.querySelector('#store-map');
const context = canvas?.getContext('2d');
// Fixed example routes illustrate the concept without connecting to live market data.
const products = {
    milk: { name: 'Hafermilch', aisle: 'Regal 3 · Milch & Alternativen', points: [[240, 408], [240, 330], [360, 330], [360, 165]] },
    apple: { name: 'Äpfel', aisle: 'Regal 1 · Obst & Gemüse', points: [[240, 408], [240, 330], [70, 330], [70, 165]] },
    bread: { name: 'Brot', aisle: 'Regal 2 · Brot & Gebäck', points: [[240, 408], [240, 330], [240, 165]] }
};

function drawMap(product) {
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
    product.points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
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

document.querySelectorAll('[data-product]').forEach(button => {
    button.addEventListener('click', () => {
        const product = products[button.dataset.product];
        document.querySelectorAll('[data-product]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        document.querySelector('#destination').textContent = product.name;
        document.querySelector('#aisle').textContent = product.aisle;
        drawMap(product);
    });
});
drawMap(products.milk);
