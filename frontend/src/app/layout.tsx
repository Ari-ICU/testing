import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "KhmerVoice AI Studio — Next.js & VoxCPM 2",
  description: "Natural Khmer Text-to-Speech, Zero-Shot & Ultimate Voice Cloning, and LoRA Fine-Tuning Studio",
};

// Browser extensions (Bitdefender, Urban VPN, etc.) inject attributes like
// `bis_skin_checked` into the DOM before React hydrates, which causes hydration
// mismatch warnings on elements we don't control (e.g. Next.js' internal
// metadata boundary). This script strips them as soon as they appear.
const stripExtensionAttrs = `
(function () {
  // Prevent browser extension bugs (e.g. Urban VPN "M_ID", Bitdefender) from polluting Next.js dev overlay
  try {
    window.addEventListener('unhandledrejection', function (event) {
      var reason = event.reason;
      var str = (reason && (reason.stack || reason.message || String(reason))) || '';
      if (
        str.includes('chrome-extension://') ||
        str.includes('moz-extension://') ||
        str.includes('M_ID') ||
        str.includes('eppiocemhmnlbhjplcgkofciiegomcon')
      ) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    }, true);

    window.addEventListener('error', function (event) {
      var src = event.filename || '';
      var msg = event.message || '';
      if (
        src.includes('chrome-extension://') ||
        src.includes('moz-extension://') ||
        msg.includes('M_ID') ||
        msg.includes('eppiocemhmnlbhjplcgkofciiegomcon')
      ) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    }, true);
  } catch (e) {}

  var ATTRS = ['bis_skin_checked', 'bis_register', 'bis_use'];
  var SELECTOR = '[bis_skin_checked],[bis_register],[bis_use]';
  function strip(el) {
    if (!el || el.nodeType !== 1) return;
    for (var i = 0; i < ATTRS.length; i++) {
      if (el.hasAttribute(ATTRS[i])) el.removeAttribute(ATTRS[i]);
    }
    var nodes = el.querySelectorAll(SELECTOR);
    for (var j = 0; j < nodes.length; j++) {
      for (var k = 0; k < ATTRS.length; k++) nodes[j].removeAttribute(ATTRS[k]);
    }
  }
  try {
    strip(document.documentElement);
    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'attributes') {
          m.target.removeAttribute(m.attributeName);
        } else {
          for (var j = 0; j < m.addedNodes.length; j++) strip(m.addedNodes[j]);
        }
      }
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['bis_skin_checked', 'bis_register', 'bis_use'],
    });
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="km" className="dark" suppressHydrationWarning>
      <body
        className="bg-[#070b14] text-slate-100 min-h-screen flex flex-col antialiased selection:bg-emerald-500/30 selection:text-emerald-200"
        suppressHydrationWarning
      >
        <Script id="strip-extension-attrs" strategy="beforeInteractive">
          {stripExtensionAttrs}
        </Script>
        {children}
      </body>
    </html>
  );
}
