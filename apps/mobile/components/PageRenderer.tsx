/**
 * The hidden browser that reads the mosque sites whose times are written in by a script.
 *
 * Mounted once, at the root. It sits offscreen and shows one page at a time from the queue in
 * services/pageRender.ts, which is where the turn-taking, the timeouts and the giving-up live
 * (and are tested). This is only the WebView: load the page, hand back what its scripts left.
 * Nothing is shown, and nothing is kept -- each page gets a fresh, private view.
 */

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { pageScript, parseMessage, serveQueue, type Serving } from "../services/pageRender";

/** How long the page's own scripts are given to write their times in after it loads. */
const SETTLE_MS = 2500;

export function PageRenderer() {
  const [current, setCurrent] = useState<Serving | null>(null);

  useEffect(() => serveQueue(setCurrent, () => setCurrent(null)), []);

  if (!current) return null;

  const onMessage = (event: WebViewMessageEvent): void => {
    const got = parseMessage(event.nativeEvent.data);
    if ("error" in got) current.done({ error: got.error });
    else current.done({ page: got });
  };

  return (
    <View style={styles.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView
        key={current.id}
        source={{ uri: current.url }}
        originWhitelist={["http://*", "https://*"]}
        injectedJavaScript={pageScript(SETTLE_MS)}
        onMessage={onMessage}
        onError={() => current.done({ error: "the page could not be opened" })}
        onHttpError={({ nativeEvent }) => current.done({ error: `the site answered ${nativeEvent.statusCode}` })}
        // nothing is kept between pages, and no page may open another
        incognito
        thirdPartyCookiesEnabled={false}
        sharedCookiesEnabled={false}
        cacheEnabled={false}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        allowsInlineMediaPlayback={false}
        mediaPlaybackRequiresUserAction
        androidLayerType="software"
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Offscreen rather than zero-sized: an Android WebView with no size does not always run its scripts.
  offscreen: { position: "absolute", left: -10_000, top: -10_000, width: 360, height: 640, opacity: 0 },
  web: { width: 360, height: 640, backgroundColor: "transparent" },
});
