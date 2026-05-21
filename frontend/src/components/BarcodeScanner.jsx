import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/library";

/**
 * BarcodeScanner
 *
 * Uses @zxing/library's BrowserMultiFormatReader to decode barcodes from the
 * device camera and display a live viewfinder.
 *
 * Props:
 *   onScan(upc: string) — called once when a barcode is successfully decoded
 *   onClose()           — called when the user presses "Cancel"
 *
 * Requirements: 3.1, 3.2, 9.1
 */
export default function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const codeReaderRef = useRef(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const codeReader = new BrowserMultiFormatReader();
    codeReaderRef.current = codeReader;

    // Start scanning once the video element is mounted
    codeReader
      .decodeFromVideoDevice(null, videoRef.current, (result, err) => {
        if (result) {
          // Successful decode — stop scanning and notify parent
          codeReader.reset();
          onScan(result.getText());
        }
        // Ignore continuous "not found" errors from ZXing while scanning
        // Only surface real errors (e.g. permission denied)
      })
      .then(() => {
        setScanning(true);
      })
      .catch((err) => {
        const message = err?.message ?? String(err);
        if (
          message.toLowerCase().includes("permission") ||
          message.toLowerCase().includes("denied") ||
          message.toLowerCase().includes("notallowederror")
        ) {
          setError(
            "Camera access denied. Please allow camera access to scan barcodes."
          );
        } else {
          setError(
            "Unable to start the camera. Please check your device and try again."
          );
        }
      });

    return () => {
      // Release camera on unmount
      codeReaderRef.current?.reset();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {error ? (
        <div
          role="alert"
          className="rounded-md bg-red-50 border border-red-300 text-red-700 px-4 py-3 text-sm max-w-sm w-full text-center"
        >
          {error}
        </div>
      ) : (
        <>
          {/* Live viewfinder */}
          <video
            ref={videoRef}
            className="w-full max-w-sm rounded-lg border border-gray-300 bg-black"
            style={{ minHeight: "240px" }}
            muted
            playsInline
            aria-label="Barcode scanner viewfinder"
          />
          {!scanning && (
            <p className="text-sm text-gray-500">Starting camera…</p>
          )}
        </>
      )}

      {/* Cancel button */}
      <button
        type="button"
        onClick={onClose}
        className="mt-2 px-6 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
