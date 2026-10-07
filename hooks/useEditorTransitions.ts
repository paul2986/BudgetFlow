import { useCallback, useRef } from 'react';
import { Platform, type Animated } from 'react-native';
import type { NavigationState, ParamListBase, RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationOptions } from 'expo-router/build/react-navigation/bottom-tabs';
import { motion } from '../styles/tokens';
import { useReducedMotion } from './useReducedMotion';

/**
 * Editor screens (expense, person, income) and sub-screens (budgets, budget
 * lock, categories, currency, import, the Tools calculators) slide in from the right over the
 * screen that opened them and slide back out when saved or closed, like an
 * iOS push/pop. They stay tab routes, so the tab bar remains in place.
 *
 * The tab navigator animates every tab's progress (0 focused, ±1 away), so
 * each navigation picks one moving screen:
 * - opening an editor: the editor slides in on top; the screen below holds still.
 * - leaving an editor (save, ✕, back, tab bar): it slides out on top of
 *   wherever you land. The tab view normally puts the focused screen on top,
 *   hence the `sceneZIndex` option (patches/expo-router+*.patch). The same
 *   patch makes unfocused screens ignore touches, so the editor sliding out
 *   (and parked off-screen after, still on top) never blocks the screen below.
 * - web keeps every visited tab screen in the page, stacked behind the focused
 *   one in route order, so the screen being slid over is lifted above the
 *   rest; otherwise the gap would show whichever hidden screen is highest
 *   (e.g. a previously closed editor) instead of the one you came from.
 * - editor to editor: pushing (person → income) slides the new one in; going
 *   back slides the top one out.
 * Tab-to-tab switches stay instant. The static screens still get a spring so
 * they stay attached, visible beneath, until the moving one settles.
 *
 * Compact (phone) only. Reduced motion swaps the slide for a short fade.
 *
 * Medium+ on web ('popup'): the form routes (FormScreen) open as pop-ups,
 * which FormScreen draws (backdrop, card and their motion) in a portal above
 * the whole app. Here the pop-up's own scene is made transparent, and the
 * screen it opened over stays shown beneath it (the `sceneVisible` option,
 * patches/expo-router+*+003). Everything else keeps the instant swap.
 * Native medium+ (iPad app) keeps the instant swap to a centred card.
 */

const EDITOR_ROUTES = new Set([
  'add-expense',
  'edit-person',
  'edit-income',
  // Sub-screens opened from Home and Settings; they push and pop the same way.
  'budgets',
  'budget-lock',
  'manage-categories',
  'currency',
  'feedback',
  'feedback-thread',
  'import-budget',
  // The calculators open from the Tools hub the same way.
  'tools/credit-card',
  'tools/savings',
  'tools/mortgage',
  'tools/debt-help',
]);

/** Routes hosted in FormScreen: pop-ups on medium+ web. */
const POPUP_ROUTES = new Set(['add-expense', 'edit-person', 'edit-income', 'import-budget']);

export type EditorTransitionMode = 'slide' | 'popup' | 'off';

/**
 * Upper bound on how long an editor stays visible after it loses focus while
 * it slides out; useFormSessionKey waits this long before resetting the form.
 */
export const EDITOR_EXIT_MS = 600;

const SPRING = {
  animation: 'spring',
  config: { ...motion.spring, mass: 1, overshootClamping: true, restDisplacementThreshold: 0.001, restSpeedThreshold: 0.001 },
} as const;

const FADE = { animation: 'timing', config: { duration: motion.exit } } as const;

type Transition = { moving?: string; under?: string };

type Options = BottomTabNavigationOptions & { sceneZIndex?: number; sceneVisible?: boolean };

type SceneStyle = ReturnType<NonNullable<BottomTabNavigationOptions['sceneStyleInterpolator']>>;

const historyKeys = (state: NavigationState) =>
  ((state as { history?: { key?: string }[] }).history ?? []).map((entry) => entry.key);

function nextTransition(prev: NavigationState['routes'][number] | undefined, state: NavigationState): Transition {
  const focused = state.routes[state.index];
  const history = historyKeys(state);
  const isEditor = (name?: string) => !!name && EDITOR_ROUTES.has(name);
  if (!prev) return {};
  // Pushed on top: from a non-editor, or from an editor that is still in the
  // history beneath (person → income).
  if (isEditor(focused.name) && (!isEditor(prev.name) || history.includes(prev.key))) {
    return { moving: focused.key, under: prev.key };
  }
  if (isEditor(prev.name)) return { moving: prev.key };
  return {};
}

/**
 * While a pop-up is focused, the screen it opened over: the nearest earlier
 * screen in the tab history that isn't itself a pop-up (person → income
 * still shows the list beneath).
 */
function screenBeneath(state: NavigationState): string | undefined {
  if (!POPUP_ROUTES.has(state.routes[state.index].name)) return undefined;
  const byKey = new Map(state.routes.map((r) => [r.key, r]));
  const history = historyKeys(state);
  for (let i = history.length - 2; i >= 0; i--) {
    const route = history[i] ? byKey.get(history[i]!) : undefined;
    if (route && !POPUP_ROUTES.has(route.name)) return route.key;
  }
  return undefined;
}

export function useEditorTransitions(width: number, mode: EditorTransitionMode) {
  const reduced = useReducedMotion();
  // Derived per navigation, so it has to remember the previous focus. Keyed on
  // the state object, which is immutable, so repeat renders agree.
  const last = useRef<{ state?: NavigationState; focusKey?: string; transition: Transition }>({ transition: {} });
  // Animated stops a value's animation once the value has no child nodes left
  // (RN detaches it). The tab view builds fresh interpolations every render,
  // and on iOS a screen gaining focus also drops its animated activity node,
  // so the screen coming into view lost its last child just as the slide
  // began, and the whole transition stopped. Hence: reuse the nodes per
  // progress value, and on native give static screens a no-op one too.
  const styles = useRef(new WeakMap<Animated.Value, { key: string; style: SceneStyle }>());
  const cachedStyle = (progress: Animated.Value, key: string, build: () => SceneStyle) => {
    const cached = styles.current.get(progress);
    if (cached?.key === key) return cached.style;
    const style = build();
    styles.current.set(progress, { key, style });
    return style;
  };

  return useCallback(
    ({ route, navigation }: { route: RouteProp<ParamListBase>; navigation: { getState: () => NavigationState } }): Options => {
      if (mode === 'off') return {};
      const state = navigation.getState();
      if (mode === 'popup') {
        if (POPUP_ROUTES.has(route.name)) return { sceneStyle: { backgroundColor: 'transparent' } };
        return route.key === screenBeneath(state) ? ({ sceneVisible: true } as Options) : {};
      }
      const memo = last.current;
      if (state !== memo.state) {
        const focusKey = state.routes[state.index].key;
        const transition =
          focusKey === memo.focusKey
            ? memo.transition
            : nextTransition(state.routes.find((r) => r.key === memo.focusKey), state);
        last.current = { state, focusKey, transition };
      }
      const { moving, under } = last.current.transition;
      // A plain tab-to-tab swap has nothing to slide: leave it with no transition at all, so
      // it's instant and the tab view only keeps simple two-state screens (no animated
      // activity states to fall out of step when taps come in quickly).
      if (!moving) return {};

      const options: Options = { transitionSpec: reduced ? FADE : SPRING };
      // Web only. Native detaches every screen not in the transition and
      // stacks the rest in route order, which already puts the editors above
      // the main tabs; a zIndex change there reorders the native views
      // mid-slide, which drops the transform.
      if (Platform.OS === 'web') {
        if (route.key === moving) options.sceneZIndex = 2;
        else if (route.key === under) options.sceneZIndex = 1;
      }
      if (route.key !== moving) {
        if (Platform.OS !== 'web') {
          options.sceneStyleInterpolator = ({ current }: { current: { progress: Animated.Value } }) =>
            cachedStyle(current.progress, 'static', () => ({
              sceneStyle: { opacity: current.progress.interpolate({ inputRange: [-1, 1], outputRange: [1, 1] }) },
            }));
        }
        return options;
      }
      options.sceneStyleInterpolator = ({ current }: { current: { progress: Animated.Value } }) =>
        cachedStyle(current.progress, `${reduced}:${width}`, () => ({
          sceneStyle: reduced
            ? { opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }) }
            : {
                transform: [
                  { translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [width, 0, width] }) },
                ],
              },
        }));
      return options;
    },
    [mode, reduced, width]
  );
}
