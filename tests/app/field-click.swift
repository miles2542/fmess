// For tests/app/field-check.sh (macOS): clicks a point in fMess's window with
// the real mouse and types with the real keyboard, as a person would. Letters
// as keys ("fm"), then a Vietnamese letter as a Unicode string ("ê"), the way
// an input method hands it over.
//
//   swift tests/app/field-click.swift <pid> <x> <y> <page width>
//
// x and y are in the page's CSS pixels; the page fills the window (its title
// bar is overlaid), so they count from the window's top left corner, scaled
// by the window's width over the page's (fMess's text size). Needs
// Accessibility access for the terminal running it.
import AppKit
import CoreGraphics

let args = CommandLine.arguments
guard args.count == 5, let pid = Int32(args[1]), let x = Double(args[2]), let y = Double(args[3]), let pageWidth = Double(args[4]) else {
  print("usage: field-click.swift <pid> <x> <y> <page width>")
  exit(2)
}
guard AXIsProcessTrusted() else {
  print("no Accessibility access: allow the terminal in System Settings › Privacy & Security › Accessibility")
  exit(2)
}
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
guard
  let window = windows.first(where: { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }),
  let bounds = window[kCGWindowBounds as String] as? [String: Double]
else {
  print("no window on screen for pid \(pid)")
  exit(1)
}
NSRunningApplication(processIdentifier: pid)?.activate()
usleep(300_000)
let scale = bounds["Width"]! / pageWidth
let point = CGPoint(x: bounds["X"]! + x * scale, y: bounds["Y"]! + y * scale)
let source = CGEventSource(stateID: .hidSystemState)
for type in [CGEventType.leftMouseDown, .leftMouseUp] {
  CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
  usleep(60_000)
}
usleep(600_000)
for key: CGKeyCode in [0x03, 0x2E] { // F, M
  for down in [true, false] {
    CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: down)?.post(tap: .cghidEventTap)
    usleep(40_000)
  }
}
let letter = Array("ê".utf16)
for down in [true, false] {
  let event = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: down)
  event?.keyboardSetUnicodeString(stringLength: letter.count, unicodeString: letter)
  event?.post(tap: .cghidEventTap)
  usleep(40_000)
}
print("clicked \(Int(point.x)),\(Int(point.y))")
