document.addEventListener('click', (e) => {
  const row = e.target.closest('.click-row');
  if (row && row.dataset.href) window.location.href = row.dataset.href;
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

document.querySelectorAll('[data-due]').forEach(el => {
  const due = new Date(el.dataset.due + 'T23:59:59');
  if (new Date() > due) {
    el.textContent += ' · Late completion = 0 pts';
    el.classList.add('late');
  }
});

// Scroll Animations (Markcon Style)
document.addEventListener("DOMContentLoaded", () => {
  const observerOptions = { root: null, rootMargin: "0px", threshold: 0.1 };

  // Track staggering delay for elements appearing simultaneously
  let staggerDelay = 0;
  let staggerTimeout;

  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        if (entry.target.classList.contains('stagger-in')) {
          entry.target.style.transitionDelay = `${staggerDelay}ms`;
          staggerDelay += 120;
          
          // Reset delay counter after a batch finishes appearing
          clearTimeout(staggerTimeout);
          staggerTimeout = setTimeout(() => { staggerDelay = 0; }, 300);
        }
        
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.reveal-up, .stagger-in').forEach(el => observer.observe(el));

  // Simple Parallax Effect for Images
  const parallaxImages = document.querySelectorAll('.parallax-img img');
  if(parallaxImages.length > 0) {
    const updateParallax = () => {
      parallaxImages.forEach(img => {
        const rect = img.parentElement.getBoundingClientRect();
        const windowCenter = window.innerHeight / 2;
        const elementCenter = rect.top + rect.height / 2;
        const offset = elementCenter - windowCenter;
        const speed = 0.15;
        img.style.transform = `translateY(${offset * speed}px) scale(1.15)`;
      });
    };
    window.addEventListener('scroll', updateParallax);
    updateParallax(); // Init on load
  }
});
