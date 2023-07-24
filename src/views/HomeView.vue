<script setup lang="ts">
import { ref, reactive, type Ref, type UnwrapRef } from 'vue';

// ================= TYPES =================
interface RequestDeviceOptions {
  acceptAllDevices: boolean;
  optionalServices: Array<String>
  // Add other properties if needed for your use case
}
interface BluetoothDevice {
  name: string | undefined;
  id: string;
  readonly gatt: Gatt
}
interface Gatt {
  connect: Function
}
interface BluetoothRemoteGATTServer {
  readonly getPrimaryService: Function
  readonly getCharacteristic: Function
}
interface BluetoothRemoteGATTService {
  readonly getCharacteristic: Function
}
interface CharacteristicIf {
  uuid: string | number | null,
  readonly writeValue: Function | null
}
type Characteristic = CharacteristicIf | null
interface WriteDataToCharacteristicOption {
  characteristic: Characteristic
  data: Ref<string>
}

// =================  CODES =================
/**
 * Zebra Bluetooth LE services and characteristics UUIDs
 * @see https://www.zebra.cn/content/dam/zebra/software/en/application-notes/AppNote-BlueToothLE-v4.pdf
 */
// const ZPRINTER_DIS_SERVICE_UUID = "0000180a-0000-1000-8000-00805f9b34fb" // Or "180A". Device Information Services UUID
const ZPRINTER_SERVICE_UUID = "38eb4a80-c570-11e3-9507-0002a5d5c51b"       // Zebra Bluetooth LE Parser Service
// const READ_FROM_ZPRINTER_CHARACTERISTIC_UUID = "38eb4a81-c570-11e3-9507-0002a5d5c51b" // Read from printer characteristic
const WRITE_TO_ZPRINTER_CHARACTERISTIC_UUID = "38eb4a82-c570-11e3-9507-0002a5d5c51b" // Write to printer characteristic

const scanning: Ref<boolean> = ref(false);
const devices: Ref<UnwrapRef<BluetoothDevice[]>> = ref([]);

const value: Ref<string> = ref('')
const printing: Ref<boolean> = ref(false);

let characteristic: Characteristic = reactive({ uuid: null, writeValue: null })
const startScan = async (): Promise<void> => {
  characteristic = await scan(ZPRINTER_SERVICE_UUID)
}
const scan = async (service_uuid: string): Promise<Characteristic | null> => {
  scanning.value = true;
  try {
    const bluetooth = window?.navigator?.bluetooth
    if (!bluetooth) {
      throw new Error("Not support web bluetooth");
    }
    /**
    * @see https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/requestDevice
    */
    const options: RequestDeviceOptions = { acceptAllDevices: true, optionalServices: [service_uuid] };
    const device: BluetoothDevice = await navigator.bluetooth.requestDevice(options)
    if (!devices.value.some((existDevice) => existDevice.id === device.id)) devices.value.push(device);
    return await connect(device)
  } catch (e) {
    console.error(e);
    console.error(window?.navigator)
    return null
  } finally {
    scanning.value = false;
  }
}

const connect = async (device: BluetoothDevice): Promise<Characteristic | null> => {
  try {
    console.log('connect device:', device)
    const server: BluetoothRemoteGATTServer = await device.gatt.connect();
    console.log('gatt server:', server)
    const service: BluetoothRemoteGATTService = await server.getPrimaryService(ZPRINTER_SERVICE_UUID);
    console.log('gatt service:', service)
    const characteristic: Characteristic = await service.getCharacteristic(WRITE_TO_ZPRINTER_CHARACTERISTIC_UUID);
    console.log('characteristic:', characteristic)
    return characteristic
  } catch (error) {
    console.error('connect error', error);
    return null
  }
}

const print = async (): Promise<void> => {
  if (characteristic && value) {
    printing.value = true

    // print string
    await writeStringToPrinter(characteristic, value)

    // print zpl
    // await writeZPLToPrinter(characteristic)

    printing.value = false
  }
}

/**
 * @type {number}
 * @desctiption Default is 20 bytes per write to characteristic
 */
const WRITE_MAX_CHUNK: number = 20

async function writeDataToCharacteristic(option: WriteDataToCharacteristicOption): Promise<void> {
  // Convert str to ArrayBuff and write to printer
  let buffer = new ArrayBuffer(option.data.value.length);
  let dataView = new DataView(buffer);
  for (var i = 0; i < option.data.value.length; i++) {
    dataView.setUint8(i, option.data.value.charCodeAt(i));
  }
  typeof option.characteristic?.writeValue === 'function' && option.characteristic.writeValue(buffer);
}
// Function to write buffer to printer
async function writeStringToPrinter(characteristic: Characteristic, str: Ref<string>): Promise<void> {
  if (str.value.length <= WRITE_MAX_CHUNK) {
    await writeDataToCharacteristic({ characteristic, data: str })
  } else {
    // Need to partion the string and write one chunk at a time.
    let j = 0
    for (let i = 0; i < str.value.length; i += WRITE_MAX_CHUNK) {
      const _subStr = i + WRITE_MAX_CHUNK <= str.value.length ? str.value.substring(i, i + WRITE_MAX_CHUNK) : str.value.substring(i, str.value.length)
      const subStr = ref(_subStr)

      // iOS doesn't need the delay during each write
      // writeDataToCharacteristic({ characteristic, data: subStr })

      // Android needs delay during each write.
      await sleep(250 * j)
      await writeDataToCharacteristic({ characteristic, data: subStr }) // Adjust the delay if needed
      j++
    }
  }
}

// Function to write ZPL commands to the printer
async function writeZPLToPrinter(characteristic: Characteristic): Promise<void> {
  try {
        /**
    * @type {string}
    * @description ZPL template with placeholders
    */
    const zplTemplate = `
^XA
^FO100,100
^A0N,36,36
^FDName: ^FS
^FO100,140
^A0N,24,24
^FD{name}^FS
^FO100,180
^A0N,36,36
^FDAddress: ^FS
^FO100,220
^A0N,24,24
^FD{address}^FS
^XZ
`;
    const dynamicData = {
      name: 'John Doe',
      address: '123 Main St',
    };
    // Merge ZPL template with dynamic data
    const mergedZPL = zplTemplate.replace(/{name}/g, dynamicData.name)
      .replace(/{address}/g, dynamicData.address);

    // Convert ZPL commands to Uint8Array (assuming zplData is a string)
    const encoder = new TextEncoder();
    const zplBytes = encoder.encode(mergedZPL);

    // Write ZPL commands to the characteristic
    typeof characteristic?.writeValue === 'function' && (await characteristic.writeValue(zplBytes))
  } catch (error) {
    console.error('Error writing ZPL commands:', error);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}
</script>

<template>
  <main>
    <el-button @click="startScan" :disabled="scanning">scan</el-button>
    <p v-if="devices.length > 0">
      <el-descriptions v-for="device in devices" :key="device.id" title="Paired Bluetooth Device Info" :column="1">
        <el-descriptions-item label="name">{{ device.name }}</el-descriptions-item>
        <el-descriptions-item label="id">{{ device.id }}</el-descriptions-item>
        <el-descriptions-item label="input print value">
          <el-input v-model="value"></el-input>
          <el-button @click="print" :disabled="printing">print</el-button>
        </el-descriptions-item>
      </el-descriptions>
    </p>
    <p v-else-if="scanning">scanning...</p>
    <p v-else>N/A</p>
  </main>
</template>
