package com.babasitaram.vault;

import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.content.ClipData;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.ContactsContract;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import java.io.ByteArrayOutputStream;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private ValueCallback<Uri[]> mFilePathCallback;
    private static final int FILECHOOSER_RESULTCODE = 1;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        webView = new WebView(this);
        setContentView(webView);

        // Security: Prevent Screen Capture & Shifting to Recents preview
        getWindow().setFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE, 
                           android.view.WindowManager.LayoutParams.FLAG_SECURE);

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        // Optimize for speed
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
        } else {
            webView.setLayerType(WebView.LAYER_TYPE_SOFTWARE, null);
        }

        webView.setWebViewClient(new WebViewClient() {
            @TargetApi(Build.VERSION_CODES.N)
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Return false to handle URLs within the WebView
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            // Handle file chooser (Import)
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, WebChromeClient.FileChooserParams fileChooserParams) {
                if (mFilePathCallback != null) {
                    mFilePathCallback.onReceiveValue(null);
                }
                mFilePathCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILECHOOSER_RESULTCODE);
                } catch (Exception e) {
                    mFilePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        // Add Javascript Interface for Clipboard and Download hooks
        webView.addJavascriptInterface(new WebAppInterface(this), "AndroidApp");

        // Inject script to override the default download/copy actions
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent intent) {
        if(requestCode == FILECHOOSER_RESULTCODE) {
            if (null == mFilePathCallback) return;
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, intent);
            mFilePathCallback.onReceiveValue(result);
            mFilePathCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, intent);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    public class WebAppInterface {
        Context mContext;

        WebAppInterface(Context c) {
            mContext = c;
        }

        @JavascriptInterface
        public void copyToClipboard(String text) {
            ClipboardManager clipboard = (ClipboardManager) mContext.getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clip = ClipData.newPlainText("Copied Text", text);
            clipboard.setPrimaryClip(clip);
        }

        @JavascriptInterface
        public void saveFile(String data, String filename, String mime) {
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            intent.putExtra(Intent.EXTRA_TEXT, data);
            mContext.startActivity(Intent.createChooser(intent, "Save Backup"));
        }

        @JavascriptInterface
        public void autoBackupNative(String data, String filename) {
            try {
                java.io.File folder = new java.io.File(mContext.getExternalFilesDir(android.os.Environment.DIRECTORY_DOCUMENTS), "VaultBackups");
                if (!folder.exists()) folder.mkdirs();
                java.io.File file = new java.io.File(folder, filename);
                java.io.FileWriter writer = new java.io.FileWriter(file);
                writer.write(data);
                writer.close();
                // showToast("Auto-backup saved to Documents folder");
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void authenticateBiometric() {
            runOnUiThread(() -> {
                BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                        .setTitle("Vault Unlock")
                        .setSubtitle("Use your fingerprint to unlock")
                        .setNegativeButtonText("Cancel")
                        .build();

                BiometricPrompt biometricPrompt = new BiometricPrompt(MainActivity.this,
                        ContextCompat.getMainExecutor(MainActivity.this),
                        new BiometricPrompt.AuthenticationCallback() {
                            @Override
                            public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                                super.onAuthenticationSucceeded(result);
                                webView.post(() -> webView.evaluateJavascript("window.onBiometricSuccess()", null));
                            }
                        });

                biometricPrompt.authenticate(promptInfo);
            });
        }

        @JavascriptInterface
        public String getInstalledApps() {
            PackageManager pm = mContext.getPackageManager();
            List<ApplicationInfo> apps = pm.getInstalledApplications(PackageManager.GET_META_DATA);
            StringBuilder sb = new StringBuilder("[");
            boolean first = true;
            for (ApplicationInfo app : apps) {
                // Filter: Only show apps that can be launched by the user (avoids system clutter)
                if (pm.getLaunchIntentForPackage(app.packageName) != null) {
                    try {
                        if (!first) sb.append(",");
                        String label = app.loadLabel(pm).toString().replace("\"", "\\\"");
                        
                        // Get Icon as Base64
                        Drawable icon = app.loadIcon(pm);
                        String iconBase64 = drawableToBase64(icon);
                        
                        sb.append("{")
                          .append("\"name\":\"").append(label).append("\",")
                          .append("\"pkg\":\"").append(app.packageName).append("\",")
                          .append("\"icon\":\"").append(iconBase64).append("\"")
                          .append("}");
                        first = false;
                    } catch (Exception e) { e.printStackTrace(); }
                }
            }
            sb.append("]");
            return sb.toString();
        }

        private String drawableToBase64(Drawable drawable) {
            Bitmap bitmap;
            if (drawable.getIntrinsicWidth() <= 0 || drawable.getIntrinsicHeight() <= 0) {
                bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            } else {
                bitmap = Bitmap.createBitmap(drawable.getIntrinsicWidth(), drawable.getIntrinsicHeight(), Bitmap.Config.ARGB_8888);
            }
            Canvas canvas = new Canvas(bitmap);
            drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
            drawable.draw(canvas);
            
            // Resize for WebView performance (usually 64x64 is enough)
            Bitmap scaled = Bitmap.createScaledBitmap(bitmap, 64, 64, true);
            ByteArrayOutputStream stream = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.PNG, 100, stream);
            byte[] byteArray = stream.toByteArray();
            return "data:image/png;base64," + Base64.encodeToString(byteArray, Base64.NO_WRAP);
        }

        @JavascriptInterface
        public void syncAutofill(String json) {
            try {
                JSONArray arr = new JSONArray(json);
                List<AutofillStore.Credential> list = new ArrayList<>();
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject obj = arr.getJSONObject(i);
                    list.add(new AutofillStore.Credential(
                            obj.getString("title"),
                            obj.getString("username"),
                            obj.getString("password"),
                            obj.optString("mobile", ""),
                            obj.optString("pkg", "")
                    ));
                }
                AutofillStore.setCredentials(list);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public String getSystemContacts() {
            if (ContextCompat.checkSelfPermission(mContext, android.Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
                return "PERMISSION_DENIED";
            }
            List<JSONObject> list = new ArrayList<>();
            Cursor cursor = mContext.getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                }, null, null, null);
            
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    try {
                        String name = cursor.getString(0);
                        String number = cursor.getString(1);
                        JSONObject obj = new JSONObject();
                        obj.put("title", name);
                        obj.put("mobile", number);
                        obj.put("category", "Contacts");
                        list.add(obj);
                    } catch (Exception e) {}
                }
                cursor.close();
            }
            
            // Build JSONArray manually for Android compatibility
            JSONArray finalArr = new JSONArray();
            for(JSONObject o : list) {
                finalArr.put(o);
            }
            return finalArr.toString();
        }

        @JavascriptInterface
        public void openAutofillSettings() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE);
                intent.setData(Uri.parse("package:com.babasitaram.vault"));
                try {
                    mContext.startActivity(intent);
                } catch (Exception e) {
                    mContext.startActivity(new Intent("android.settings.AUTOFILL_SETTINGS"));
                }
            } else {
                showToast("Autofill is only available on Android 8.0+");
            }
        }

        @JavascriptInterface
        public void showToast(String message) {
            Toast.makeText(mContext, message, Toast.LENGTH_SHORT).show();
        }
    }
}
