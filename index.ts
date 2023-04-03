import '@wokwi/elements';
import './style.css';

import { ConsoleLogger, GPIOPinState, LogLevel, RP2040 } from 'rp2040js';
import { buildHex } from './compile';
import { LEDElement } from '@wokwi/elements';
import { bootromB1 } from './bootrom';
import { loadHex } from './intelhex';

const BLINK_CODE = `
// LEDs connected to pins 2..4

byte leds[] = {2, 3, 4};
void setup() {
  for (byte i = 0; i < sizeof(leds); i++) {
    pinMode(leds[i], OUTPUT);
  }
}

int i = 0;
void loop() {
  digitalWrite(leds[i], HIGH);
  delay(250);
  digitalWrite(leds[i], LOW);
  i = (i + 1) % sizeof(leds);
}`.trim();

let editor;
declare const window: any;
declare const monaco: any;
window.editorLoaded = () => {
  window.require.config({
    paths: {
      vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.26.1/min/vs'
    }
  });
  window.require(['vs/editor/editor.main'], () => {
    editor = monaco.editor.create(document.querySelector('.code-editor'), {
      value: BLINK_CODE,
      language: 'cpp',
      minimap: { enabled: false }
    });
  });
};

// Set up LEDs
const LEDs = Array.from(
  document.querySelectorAll<LEDElement & HTMLElement>('wokwi-led')
);

// Set up toolbar
let rp2040: RP2040;

const runButton = document.querySelector('#run-button');
runButton.addEventListener('click', compileAndRun);
const stopButton = document.querySelector('#stop-button');
stopButton.addEventListener('click', stopCode);
const statusLabel = document.querySelector('#status-label');
const compilerOutputText = document.querySelector('#compiler-output-text');

function executeProgram(hex: string) {
  rp2040 = new RP2040();
  rp2040.loadBootrom(bootromB1);
  rp2040.logger = new ConsoleLogger(LogLevel.Error);
  loadHex(hex, rp2040.flash, 0x10000000);
  for (const led of LEDs) {
    const pin = parseInt(led.getAttribute('label'), 10);
    rp2040.gpio[pin].addListener(state => {
      led.value = state === GPIOPinState.High;
    });
  }
  rp2040.PC = 0x10000000;
  rp2040.execute();
}

async function compileAndRun() {
  for (const led of LEDs) {
    led.value = false;
  }

  runButton.setAttribute('disabled', '1');
  try {
    statusLabel.textContent = 'Compiling...';
    const result = await buildHex(editor.getModel().getValue());
    compilerOutputText.textContent = result.stderr || result.stdout;
    if (result.hex) {
      compilerOutputText.textContent += '\nProgram running...';
      stopButton.removeAttribute('disabled');
      executeProgram(result.hex);
    } else {
      runButton.removeAttribute('disabled');
    }
  } catch (err) {
    runButton.removeAttribute('disabled');
    alert('Failed: ' + err);
  } finally {
    statusLabel.textContent = '';
  }
}

function stopCode() {
  stopButton.setAttribute('disabled', '1');
  runButton.removeAttribute('disabled');
  if (rp2040) {
    rp2040.stop();
    rp2040 = null;
  }
}
