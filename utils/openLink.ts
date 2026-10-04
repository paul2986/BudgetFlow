import { Linking, Platform } from 'react-native';

/**
 * Opens a web page or dials a number, and reports whether it worked so the
 * caller can say so. Only `https:` and `tel:` go through: the links are fixed
 * data today, but this is the one place the app hands a URL to the system, so
 * anything else is refused here rather than trusted.
 *
 * On the web a `tel:` link is followed in the current tab, as a plain phone link
 * is (the phone app takes over and the page stays put), rather than opened in a
 * new tab, which leaves a blank one behind on desktop. A desktop browser may do
 * nothing with it, so screens show the number as text as well.
 */
export async function openLink(url: string): Promise<boolean> {
  if (!/^(https:\/\/|tel:\+?[0-9]+$)/.test(url)) return false;
  try {
    if (Platform.OS === 'web' && url.startsWith('tel:')) {
      window.location.href = url;
    } else {
      await Linking.openURL(url);
    }
    return true;
  } catch (e) {
    console.log('openLink: could not open', url, e);
    return false;
  }
}
