/* BASE TÉCNICA — PREMIUM: microinterações (reveal, menu, parallax sutil). */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var revealTargets = document.querySelectorAll("[data-reveal]");
  if (reduce || !("IntersectionObserver" in window)) {
    revealTargets.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); obs.unobserve(e.target); }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });
    revealTargets.forEach(function (el) { obs.observe(el); });
  }

  // Parallax sutil da mídia do hero (desativado com reduced-motion).
  var heroMedia = document.querySelector(".pr-hero-media");
  if (heroMedia && !reduce) {
    window.addEventListener("scroll", function () {
      var offset = Math.min(60, window.scrollY * 0.06);
      heroMedia.style.transform = "translateY(" + offset + "px)";
    }, { passive: true });
  }

  var toggle = document.querySelector(".nav-toggle");
  var mobileNav = document.getElementById("menu-mobile");
  if (toggle && mobileNav) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      if (open) mobileNav.setAttribute("hidden", "");
      else mobileNav.removeAttribute("hidden");
    });
    mobileNav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        mobileNav.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  var yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
