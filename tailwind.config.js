/**
 * tailwind.config.js
 *
 * Mirrors the theme that used to live in the inline `tailwind.config`
 * script tag next to the CDN build. The CDN is gone; `node build.js`
 * compiles this into css/style.min.css.
 *
 * `content` scans index.html and every js/*.js file, so utility classes
 * written inside template literals in ui-controller.js are picked up too.
 */
module.exports = {
    content: [
        './index.html',
        './js/*.js',
    ],
    // Class names assembled at runtime by string concatenation cannot be
    // seen by the static scanner, so they are listed explicitly here.
    safelist: [
        'reaction-neutral', 'reaction-pain', 'reaction-distress',
        'reaction-critical', 'reaction-improving', 'reaction-recovered',
        'is-active', 'is-open', 'is-hidden', 'is-selected',
        'is-correct', 'is-wrong', 'is-fatal-pick',
        'active-view', 'hidden-view',
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'Noto Sans Thai', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
            },
            colors: {
                navy: {
                    950: '#070B16',
                    900: '#0A0F1D',
                    850: '#0B132B',
                    800: '#131B2E',
                    700: '#1C2541',
                    600: '#26314F',
                    500: '#33415F',
                },
                teal:   { DEFAULT: '#48E5C2', 400: '#48E5C2', 500: '#2BC9A6', 600: '#17A98A' },
                gold:   { DEFAULT: '#FFB703', 400: '#FFB703', 500: '#E5A200' },
                acuity: { DEFAULT: '#E63946', 500: '#E63946', 600: '#C42B37' },
            },
            animation: {
                'fade-in': 'fadeIn 0.4s ease-out forwards',
                'slide-up': 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'quest-glow': 'questGlow 2.4s ease-in-out infinite',
                'vital-pulse': 'vitalPulse 1.8s ease-in-out infinite',
                'ecg': 'ecgPulse 1.6s ease-in-out infinite',
            },
            keyframes: {
                fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
                slideUp: {
                    '0%': { opacity: '0', transform: 'translateY(16px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                questGlow: {
                    '0%, 100%': { boxShadow: '0 0 0 1px rgba(72,229,194,.45), 0 0 22px rgba(72,229,194,.20)' },
                    '50%':      { boxShadow: '0 0 0 1px rgba(72,229,194,.85), 0 0 40px rgba(72,229,194,.42)' },
                },
                vitalPulse: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.45' } },
                ecgPulse: {
                    '0%':   { strokeDashoffset: '260', opacity: '.35' },
                    '55%':  { strokeDashoffset: '0',   opacity: '1' },
                    '100%': { strokeDashoffset: '-260', opacity: '.35' },
                },
            },
        },
    },
    plugins: [],
};
