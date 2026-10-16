import SwiftUI
import AVFoundation
import VisionKit

/// Kamera-Scanner fuer QR-Anker. Liefert jeden neu erkannten Code als Text an `onPayload`.
/// Auf Geraeten ohne Scanner oder ohne Kamerazugriff erscheint ein Hinweis; in DEBUG
/// kann stattdessen ein Payload eingefuegt werden, der denselben Weg nimmt.
struct AnchorScannerView: View {
    /// Hinweis aus dem letzten Scan (z. B. unbekannter Code); der Scanner bleibt offen.
    let statusMessage: String?
    let onPayload: (String) -> Void
    let onClose: () -> Void

    @State private var cameraStatus = AVCaptureDevice.authorizationStatus(for: .video)
    #if DEBUG
    @State private var debugPayload = ""
    #endif

    private static let unavailableText = "Der QR-Scanner ist auf diesem Gerät nicht verfügbar."
    private static let cameraDeniedText = "Kamerazugriff ist ausgeschaltet. Du kannst ihn in den iPhone-Einstellungen erlauben."

    var body: some View {
        VStack(spacing: 16) {
            scannerArea
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            if let statusMessage {
                Text(statusMessage)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)
            }

            Button("Schließen", action: onClose)
                .buttonStyle(.borderedProminent)
                .padding(.bottom, 8)
        }
        .padding(.top, 16)
        .padding(.horizontal, 16)
        .task {
            guard cameraStatus == .notDetermined else { return }
            _ = await AVCaptureDevice.requestAccess(for: .video)
            cameraStatus = AVCaptureDevice.authorizationStatus(for: .video)
        }
    }

    @ViewBuilder
    private var scannerArea: some View {
        if cameraStatus == .denied || cameraStatus == .restricted {
            fallback(message: Self.cameraDeniedText)
        } else if cameraStatus == .notDetermined {
            ProgressView()
        } else if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
            QRScannerRepresentable(onPayload: onPayload)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        } else {
            fallback(message: Self.unavailableText)
        }
    }

    @ViewBuilder
    private func fallback(message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "qrcode.viewfinder")
                .font(.system(size: 48, weight: .regular))
                .foregroundStyle(.secondary)

            Text(message)
                .font(.body)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            #if DEBUG
            VStack(alignment: .leading, spacing: 8) {
                TextField("Payload einfügen", text: $debugPayload, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .lineLimit(1...3)

                Button("Übernehmen") {
                    let text = debugPayload.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !text.isEmpty else { return }
                    onPayload(text)
                }
                .buttonStyle(.bordered)
                .disabled(debugPayload.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(.horizontal, 8)
            #endif
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 16)
    }
}

/// UIKit-Bruecke zu VisionKit: nur QR-Codes, Treffer werden einmal je erkanntem Item gemeldet.
private struct QRScannerRepresentable: UIViewControllerRepresentable {
    let onPayload: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onPayload: onPayload)
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let controller = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {
        guard !controller.isScanning else { return }
        try? controller.startScanning()
    }

    static func dismantleUIViewController(_ controller: DataScannerViewController, coordinator: Coordinator) {
        controller.stopScanning()
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let onPayload: (String) -> Void

        init(onPayload: @escaping (String) -> Void) {
            self.onPayload = onPayload
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            for item in addedItems {
                guard case .barcode(let barcode) = item,
                      let payload = barcode.payloadStringValue else {
                    continue
                }
                onPayload(payload)
            }
        }
    }
}
