import Capacitor

/// Root view controller — subclasses Capacitor's stock CAPBridgeViewController
/// solely to keep the home indicator always visible. Capacitor's default
/// implementation returns true for prefersHomeIndicatorAutoHidden, which is
/// standard iOS behaviour for "immersive" screens: the indicator dims out
/// after a few seconds of inactivity and only reappears on touch. Marco
/// noticed this (it looked like the indicator was "disabled") and asked for
/// it to just stay visible, like most non-immersive apps.
class MainViewController: CAPBridgeViewController {
    override var prefersHomeIndicatorAutoHidden: Bool {
        false
    }
}
