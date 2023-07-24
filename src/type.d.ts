interface NavigatorBluetooth {
  readonly bluetooth: Bluetooth;
}

interface Navigator extends NavigatorBluetooth {}

declare let navigator: Navigator;