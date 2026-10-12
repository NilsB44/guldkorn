package se.guldkorn.photolibrary;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.util.Size;
import androidx.exifinterface.media.ExifInterface;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Guldkorn's access to the Android photo library (MediaStore). Everything stays on the device. */
@CapacitorPlugin(
    name = "PhotoLibrary",
    permissions = {
        @Permission(alias = PhotoLibraryPlugin.PHOTOS, strings = { Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.ACCESS_MEDIA_LOCATION }),
        @Permission(alias = PhotoLibraryPlugin.PHOTOS_LEGACY, strings = { Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.ACCESS_MEDIA_LOCATION })
    }
)
public class PhotoLibraryPlugin extends Plugin {

    static final String PHOTOS = "photos";
    static final String PHOTOS_LEGACY = "photosLegacy";

    private final ExecutorService executor = Executors.newFixedThreadPool(2);

    private String alias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? PHOTOS : PHOTOS_LEGACY;
    }

    private boolean has(String permission) {
        return getContext().checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private String access() {
        String full = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? Manifest.permission.READ_MEDIA_IMAGES : Manifest.permission.READ_EXTERNAL_STORAGE;
        if (has(full)) return "granted";
        if (Build.VERSION.SDK_INT >= 34 && has("android.permission.READ_MEDIA_VISUAL_USER_SELECTED")) return "limited";
        PermissionState state = getPermissionState(alias());
        return state == PermissionState.DENIED ? "denied" : "prompt";
    }

    private void resolveAccess(PluginCall call) {
        JSObject result = new JSObject();
        result.put("access", access());
        call.resolve(result);
    }

    @PluginMethod
    public void checkAccess(PluginCall call) {
        resolveAccess(call);
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if ("granted".equals(access())) {
            resolveAccess(call);
            return;
        }
        requestPermissionForAlias(alias(), call, "accessCallback");
    }

    @PermissionCallback
    private void accessCallback(PluginCall call) {
        resolveAccess(call);
    }

    @PluginMethod
    public void manageLimitedSelection(PluginCall call) {
        // On Android 14+ asking again shows the photo selection dialog.
        requestPermissionForAlias(alias(), call, "accessCallback");
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void getPhotos(PluginCall call) {
        final long from = call.getDouble("from", 0.0).longValue();
        final long to = call.getDouble("to", (double) System.currentTimeMillis()).longValue();
        final int limit = call.getInt("limit", 1000);

        executor.execute(() -> {
            try {
                ContentResolver resolver = getContext().getContentResolver();
                Uri collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                String[] projection = {
                    MediaStore.Images.Media._ID,
                    MediaStore.Images.Media.DATE_TAKEN,
                    MediaStore.Images.Media.DATE_ADDED,
                    MediaStore.Images.Media.WIDTH,
                    MediaStore.Images.Media.HEIGHT,
                    MediaStore.Images.Media.ORIENTATION,
                    MediaStore.Images.Media.RELATIVE_PATH
                };
                // DATE_TAKEN is ms; some images lack it, then fall back to DATE_ADDED (seconds).
                String selection = "(" + MediaStore.Images.Media.DATE_TAKEN + " >= ? AND " + MediaStore.Images.Media.DATE_TAKEN + " < ?) OR (" +
                    MediaStore.Images.Media.DATE_TAKEN + " IS NULL AND " + MediaStore.Images.Media.DATE_ADDED + " >= ? AND " + MediaStore.Images.Media.DATE_ADDED + " < ?)";
                String[] args = { String.valueOf(from), String.valueOf(to), String.valueOf(from / 1000), String.valueOf(to / 1000) };
                String order = MediaStore.Images.Media.DATE_TAKEN + " ASC";
                boolean canReadLocation = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || has(Manifest.permission.ACCESS_MEDIA_LOCATION);

                JSArray photos = new JSArray();
                try (Cursor c = resolver.query(collection, projection, selection, args, order)) {
                    if (c != null) {
                        int count = 0;
                        while (c.moveToNext() && count < limit) {
                            long id = c.getLong(0);
                            long taken = c.isNull(1) ? c.getLong(2) * 1000 : c.getLong(1);
                            int width = c.getInt(3);
                            int height = c.getInt(4);
                            int orientation = c.isNull(5) ? 0 : c.getInt(5);
                            String path = c.isNull(6) ? "" : c.getString(6);
                            if (orientation == 90 || orientation == 270) {
                                int t = width;
                                width = height;
                                height = t;
                            }
                            JSObject p = new JSObject();
                            p.put("id", String.valueOf(id));
                            p.put("takenAt", taken);
                            p.put("width", width);
                            p.put("height", height);
                            p.put("screenshot", path.toLowerCase().contains("screenshot"));
                            if (canReadLocation) {
                                double[] latLon = readLocation(resolver, ContentUris.withAppendedId(collection, id));
                                if (latLon != null) {
                                    p.put("lat", latLon[0]);
                                    p.put("lon", latLon[1]);
                                }
                            }
                            photos.put(p);
                            count++;
                        }
                    }
                }
                JSObject result = new JSObject();
                result.put("photos", photos);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Could not read photos: " + e.getMessage(), e);
            }
        });
    }

    private double[] readLocation(ContentResolver resolver, Uri uri) {
        try {
            Uri original = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? MediaStore.setRequireOriginal(uri) : uri;
            try (InputStream in = resolver.openInputStream(original)) {
                if (in == null) return null;
                double[] latLon = new ExifInterface(in).getLatLong();
                if (latLon == null || (latLon[0] == 0 && latLon[1] == 0)) return null;
                return latLon;
            }
        } catch (Exception e) {
            return null;
        }
    }

    @PluginMethod
    public void getImage(PluginCall call) {
        final String id = call.getString("id");
        final int maxEdge = call.getInt("maxEdge", 1080);
        final int quality = (int) Math.round(call.getDouble("quality", 0.85) * 100);
        if (id == null) {
            call.reject("Missing id");
            return;
        }
        executor.execute(() -> {
            try {
                Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, Long.parseLong(id));
                Bitmap bitmap = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? getContext().getContentResolver().loadThumbnail(uri, new Size(maxEdge, maxEdge), null) // keeps aspect ratio and orientation
                    : decodeLegacy(uri, maxEdge);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out);
                JSObject result = new JSObject();
                result.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                result.put("width", bitmap.getWidth());
                result.put("height", bitmap.getHeight());
                bitmap.recycle();
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Could not load photo: " + e.getMessage(), e);
            }
        });
    }

    /** Android 9 and older: sample-decode, then rotate according to EXIF. */
    private Bitmap decodeLegacy(Uri uri, int maxEdge) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = resolver.openInputStream(uri)) {
            BitmapFactory.decodeStream(in, null, bounds);
        }
        int sample = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxEdge) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        Bitmap bitmap;
        try (InputStream in = resolver.openInputStream(uri)) {
            bitmap = BitmapFactory.decodeStream(in, null, opts);
        }
        int rotation = 0;
        try (InputStream in = resolver.openInputStream(uri)) {
            rotation = new ExifInterface(in).getRotationDegrees();
        }
        float scale = Math.min(1f, (float) maxEdge / Math.max(bitmap.getWidth(), bitmap.getHeight()));
        Matrix m = new Matrix();
        m.postScale(scale, scale);
        m.postRotate(rotation);
        Bitmap result = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), m, true);
        if (result != bitmap) bitmap.recycle();
        return result;
    }
}
