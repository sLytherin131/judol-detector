// Lucide icons
lucide.createIcons();

// Navbar border on scroll
const nav = document.getElementById('siteNav');
window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 16);
}, { passive: true });

// Smooth scroll untuk anchor links
document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
        const target = document.querySelector(a.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        const y = target.getBoundingClientRect().top + window.scrollY - 68;
        window.scrollTo({ top: y, behavior: 'smooth' });
    });
});
