import Capacitor
import Foundation
import Photos
import UIKit

/// Guldkorn's access to the iPhone photo library (PhotoKit).
/// Everything stays on the device; images are only handed to the app's own web view.
@objc(PhotoLibraryPlugin)
public class PhotoLibraryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotoLibraryPlugin"
    public let jsName = "PhotoLibrary"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageLimitedSelection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPhotos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getImage", returnType: CAPPluginReturnPromise)
    ]

    private static func accessString(_ status: PHAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "granted"
        case .limited: return "limited"
        case .notDetermined: return "prompt"
        case .denied, .restricted: return "denied"
        @unknown default: return "denied"
        }
    }

    @objc func checkAccess(_ call: CAPPluginCall) {
        call.resolve(["access": Self.accessString(PHPhotoLibrary.authorizationStatus(for: .readWrite))])
    }

    @objc func requestAccess(_ call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            call.resolve(["access": Self.accessString(status)])
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }

    @objc func manageLimitedSelection(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController else {
                call.reject("No view controller")
                return
            }
            PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: controller) { _ in
                call.resolve()
            }
        }
    }

    @objc func getPhotos(_ call: CAPPluginCall) {
        let from = Date(timeIntervalSince1970: (call.getDouble("from") ?? 0) / 1000)
        let to = Date(timeIntervalSince1970: (call.getDouble("to") ?? Date().timeIntervalSince1970 * 1000) / 1000)
        let limit = call.getInt("limit") ?? 1000

        DispatchQueue.global(qos: .userInitiated).async {
            let options = PHFetchOptions()
            options.predicate = NSPredicate(
                format: "mediaType == %d AND creationDate >= %@ AND creationDate < %@",
                PHAssetMediaType.image.rawValue, from as NSDate, to as NSDate)
            options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
            options.fetchLimit = limit
            // Show each burst once by default would hide shots; we want all of them for "pick the best".
            options.includeAllBurstAssets = true

            var photos: [[String: Any]] = []
            PHAsset.fetchAssets(with: options).enumerateObjects { asset, _, _ in
                var photo: [String: Any] = [
                    "id": asset.localIdentifier,
                    "takenAt": (asset.creationDate ?? Date()).timeIntervalSince1970 * 1000,
                    "width": asset.pixelWidth,
                    "height": asset.pixelHeight,
                    "favorite": asset.isFavorite,
                    "screenshot": asset.mediaSubtypes.contains(.photoScreenshot)
                ]
                if let location = asset.location {
                    photo["lat"] = location.coordinate.latitude
                    photo["lon"] = location.coordinate.longitude
                }
                if let burst = asset.burstIdentifier {
                    photo["burstId"] = burst
                }
                photos.append(photo)
            }
            call.resolve(["photos": photos])
        }
    }

    @objc func getImage(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Missing id")
            return
        }
        let maxEdge = Double(call.getInt("maxEdge") ?? 1080)
        let quality = CGFloat(call.getDouble("quality") ?? 0.85)
        guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
            call.reject("Photo not found")
            return
        }

        let longest = Double(max(asset.pixelWidth, asset.pixelHeight))
        let scale = longest > 0 ? min(1, maxEdge / longest) : 1
        let target = CGSize(width: (Double(asset.pixelWidth) * scale).rounded(), height: (Double(asset.pixelHeight) * scale).rounded())

        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .exact
        options.isNetworkAccessAllowed = true // photos stored in iCloud ("Optimise iPhone Storage")
        options.isSynchronous = false

        PHImageManager.default().requestImage(for: asset, targetSize: target, contentMode: .aspectFit, options: options) { image, info in
            if let error = info?[PHImageErrorKey] as? Error {
                call.reject("Could not load photo: \(error.localizedDescription)")
                return
            }
            guard let image = image, let data = image.jpegData(compressionQuality: quality) else {
                call.reject("Could not load photo")
                return
            }
            call.resolve([
                "data": data.base64EncodedString(),
                "width": Int(image.size.width * image.scale),
                "height": Int(image.size.height * image.scale)
            ])
        }
    }
}
