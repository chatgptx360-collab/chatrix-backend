import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing,
} from "react-native-reanimated";
import { useTheme } from "@/lib/ui/theme";

/**
 * Three-dot typing indicator. Each dot pulses on a phase-shifted timeline so
 * it reads as "typing" without being noisy. Pure Reanimated — runs on the UI
 * thread, no JS-thread cost.
 */
export function TypingDots() {
  return (
    <View style={s.wrap}>
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const t = useTheme();
  const o = useSharedValue(0.3);
  useEffect(() => {
    o.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: delay, easing: Easing.linear }),
        withTiming(1.0, { duration: 350, easing: Easing.out(Easing.quad) }),
        withTiming(0.3, { duration: 350, easing: Easing.in(Easing.quad) }),
      ),
      -1, false,
    );
  }, [delay, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: 0.7 + 0.3 * o.value }] }));
  return <Animated.View style={[s.dot, { backgroundColor: t.colors.muted }, style]} />;
}

const s = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, gap: 5 },
  dot:  { width: 6, height: 6, borderRadius: 3 },
});
