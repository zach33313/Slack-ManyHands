# Animation Frameworks Research for Sidebar

**Goal**: Find the best animation solution for sidebar expand/collapse, panel slides, and transitions.

**Decision Date**: February 2026

---

## Requirement Analysis

For a Slack-like sidebar, we need:
- ✅ Smooth expand/collapse (300-400ms)
- ✅ Slide-in/slide-out panels (200-300ms)
- ✅ Unread badge pulse (optional)
- ✅ Hover transitions (50-100ms)
- ✅ GPU-accelerated (60fps)
- ✅ Mobile-friendly
- ✅ Minimal bundle impact

---

## Technology Comparison

### 1. **Tailwind CSS + CSS Animations** ⭐ RECOMMENDED

**Bundle Size**: 0 KB (already included)
**Learning Curve**: ★★☆☆☆ (easy)
**Performance**: ⚡⚡⚡⚡⚡ (native CSS)

#### Recommendation
**Use Tailwind CSS for 95% of sidebar animations.**

#### Installation
```bash
# Already in package.json
npm install tailwindcss-animate@1.0.7
```

#### Working Code Examples

**Sidebar Mobile Collapse/Expand**:
```jsx
// Sidebar.tsx - ALREADY IMPLEMENTED
<aside
  className={cn(
    'fixed inset-y-0 left-0 z-40 lg:static',
    sidebarOpen
      ? 'translate-x-0'
      : '-translate-x-full lg:translate-x-0',
    'transition-transform duration-200 ease-in-out'
  )}
>
  {/* Content */}
</aside>
```

**Right Panel Slide-In**:
```jsx
// RightPanel.tsx - ALREADY IMPLEMENTED
<div
  className={cn(
    'animate-in slide-in-from-right-5 duration-200'
  )}
>
  {/* Content */}
</div>
```

**Section Collapse (Smooth Height)**:
```jsx
// Add to tailwind.config.ts
module.exports = {
  theme: {
    extend: {
      keyframes: {
        'slide-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'slide-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
      },
      animation: {
        'slide-down': 'slide-down 200ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
      },
    },
  },
};

// Component
{isOpen && <div className="animate-slide-down overflow-hidden">{children}</div>}
{!isOpen && <div className="animate-slide-up overflow-hidden">{children}</div>}
```

**Unread Badge Pulse**:
```jsx
// tailwind.config.ts
module.exports = {
  theme: {
    extend: {
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
};

// Usage
<span className="animate-pulse-subtle bg-primary/20 text-primary">5</span>
```

#### Pros
- ✅ Zero bundle overhead
- ✅ Native browser performance (GPU accelerated)
- ✅ Works with existing Tailwind classes
- ✅ Easy to reason about (declarative)
- ✅ Mobile-optimized (touch-friendly)
- ✅ SSR-friendly (no JS execution needed)

#### Cons
- ❌ Limited to CSS properties (no complex morphing)
- ❌ No physics-based animations (springs, bounces)
- ❌ Requires custom keyframes for complex sequences

#### When to Use
- ✅ Sidebar expand/collapse
- ✅ Modal slide-in/out
- ✅ Hover transitions
- ✅ Unread badges
- ✅ Skeleton loaders

---

### 2. **Framer Motion v11** (Alternative for Complex Animations)

**Bundle Size**: 40 KB gzipped
**Learning Curve**: ★★★☆☆ (moderate)
**Performance**: ⚡⚡⚡⚡☆ (JS-based, slower than CSS)

#### When to Consider
- Shared layout animations (elements moving between parent containers)
- Gesture-driven animations (drag listeners)
- Complex sequencing (staggered list items)
- Physics-based animations (spring, inertia)

#### Code Example (NOT RECOMMENDED for sidebar, but shown for reference)

```bash
npm install framer-motion@11.0.0
```

```jsx
import { motion } from 'framer-motion';

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <motion.aside
      animate={{
        x: isOpen ? 0 : -260,
        opacity: isOpen ? 1 : 0,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
      }}
      className="w-[260px]"
    >
      {/* Content */}
    </motion.aside>
  );
}
```

#### Verdict for This Project
**❌ NOT RECOMMENDED** - Tailwind CSS handles all sidebar animations better.

#### Pros
- ✅ Spring physics animations
- ✅ Gesture support (drag, hover)
- ✅ Layout animations
- ✅ Powerful animation orchestration

#### Cons
- ❌ 40KB bundle penalty
- ❌ Slower than native CSS (JS execution overhead)
- ❌ Not SSR-friendly (requires client hydration)
- ❌ Overkill for sidebar animations

---

### 3. **React Spring** (Alternative for Physics Animations)

**Bundle Size**: 35 KB gzipped
**Learning Curve**: ★★★★☆ (steeper)
**Performance**: ⚡⚡⚡⚡☆

#### When to Consider
- Physics-based scroll sync animations
- Gesture-driven transforms

#### Verdict
**❌ AVOID** - Similar drawbacks to Framer Motion, no advantage for sidebar use case.

---

### 4. **GSAP** (Professional Animation Library)

**Bundle Size**: 70 KB gzipped
**Learning Curve**: ★★★★★ (very steep)
**Performance**: ⚡⚡⚡⚡⚡

#### Verdict
**❌ AVOID** - Massive bundle for sidebar animations. Designed for complex AD campaigns, not app UI.

---

### 5. **Pure CSS with CSS Variables** (Advanced Tailwind)

**Bundle Size**: 0 KB
**Learning Curve**: ★★★★☆ (requires CSS knowledge)
**Performance**: ⚡⚡⚡⚡⚡

#### When to Consider
- Custom easing functions
- Responsive animations (different timing for mobile)
- Coordinating multiple animations

#### Example: Desktop Sidebar Collapse with Width Transition

```jsx
// tailwind.config.ts
module.exports = {
  theme: {
    extend: {
      spacing: {
        'sidebar-collapsed': '68px',
        'sidebar-expanded': '260px',
      },
    },
  },
};

// Sidebar.tsx
export function Sidebar() {
  const [expanded, setExpanded] = useState(true);

  return (
    <aside
      style={{
        '--sidebar-width': expanded ? 'var(--spacing-sidebar-expanded)' : 'var(--spacing-sidebar-collapsed)',
        transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        width: 'var(--sidebar-width)',
      } as React.CSSProperties}
      className="bg-background"
    >
      {/* Content */}
    </aside>
  );
}
```

#### Verdict
**✅ RECOMMENDED** (for advanced cases) - Use alongside Tailwind.

---

## Tailwind Animation Cheat Sheet

### Built-in Animations (via tailwindcss-animate)

```jsx
// Fade in
<div className="animate-in fade-in duration-200" />

// Slide
<div className="animate-in slide-in-from-left-8 duration-300" />
<div className="animate-in slide-in-from-right-5 duration-200" />

// Zoom
<div className="animate-in zoom-in-95 duration-200" />

// Combined
<div className="animate-in fade-in slide-in-from-right-5 duration-300" />

// Reverse (for closing)
<div className="animate-out fade-out slide-out-to-right-5 duration-200" />
```

### Transition Classes (Hover/State Changes)

```jsx
// Smooth transitions
<div className="transition-all duration-200 ease-in-out" />

// Specific property
<div className="transition-colors duration-200" />
<div className="transition-transform duration-300" />

// Easing functions
className="ease-linear"        // constant speed
className="ease-in"           // slow start
className="ease-out"          // slow end ⭐ usually best
className="ease-in-out"       // both
```

### Duration Scale

```jsx
duration-75        // 75ms
duration-100       // 100ms
duration-150       // 150ms
duration-200       // 200ms ⭐ sidebar default
duration-300       // 300ms ⭐ modal default
duration-500       // 500ms (slow transitions)
```

---

## Recommended Animation Timings for Slack-Like UI

| Animation | Duration | Easing | Trigger |
|-----------|----------|--------|---------|
| Sidebar expand/collapse | 200ms | ease-out | Click toggle |
| Right panel slide-in | 200ms | ease-out | Click button |
| Right panel slide-out | 150ms | ease-in | Click X |
| Section collapse | 200ms | ease-out | Click header |
| Hover effects | 100ms | ease-out | Mouse enter |
| Unread badge appear | 300ms | ease-out | New message |
| Modal fade in | 150ms | ease-out | Dialog open |
| Menu fade in | 100ms | ease-out | Click trigger |

---

## Implementation Checklist

- [x] Use Tailwind CSS for all sidebar animations
- [x] Use `animate-in` / `animate-out` for entrance/exit
- [x] Use `transition-all duration-200 ease-out` for state changes
- [x] Prefers motion: `motion-safe:animate-in motion-reduce:animate-none`
- [x] Test on mobile (60fps target)
- [ ] Add GPU acceleration: `will-change: transform`
- [ ] Profile with DevTools (Rendering tab)

---

## Code Template for New Components

```tsx
// Collapsible section with smooth animation
interface CollapsibleSectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors duration-200"
      >
        <span>{title}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 transition-transform duration-200 ease-out',
            isOpen ? 'rotate-0' : '-rotate-90'
          )}
        />
      </button>

      {isOpen && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200 origin-top">
          {children}
        </div>
      )}
    </div>
  );
}
```

---

## Appendix: GPU Acceleration

For smooth 60fps animations on mobile, ensure you're animating GPU-friendly properties:

### ✅ Fast (GPU accelerated)
- `transform` (translate, rotate, scale)
- `opacity`

### ❌ Slow (layout recalculation)
- `width`, `height`
- `left`, `right`, `top`, `bottom` (position)
- `padding`, `margin`

### Optimization

```jsx
// ❌ Avoid: animates width (triggers layout recalculation)
<div style={{ width: isOpen ? 260 : 68 }} />

// ✅ Good: animates transform (GPU accelerated)
<div
  style={{
    transform: isOpen ? 'scaleX(1)' : 'scaleX(0.26)',
    transformOrigin: 'left',
  }}
/>
```

---

## Final Recommendation

| Use Case | Solution | Bundle Cost | Speed |
|----------|----------|-------------|-------|
| Sidebar expand/collapse | Tailwind CSS | 0 KB | ⚡⚡⚡⚡⚡ |
| Panel slide-in/out | Tailwind CSS | 0 KB | ⚡⚡⚡⚡⚡ |
| Hover effects | Tailwind CSS | 0 KB | ⚡⚡⚡⚡⚡ |
| Unread badge | Tailwind CSS | 0 KB | ⚡⚡⚡⚡⚡ |
| Complex gestures | Framer Motion | 40 KB | ⚡⚡⚡ |
| Physics animations | React Spring | 35 KB | ⚡⚡⚡ |

**VERDICT**: Use **Tailwind CSS + CSS Variables** for 100% of sidebar animations. Don't add Framer Motion unless you need gesture-driven animations.

---

**Last Updated**: 2026-02-28
