package com.babasitaram.pro;

import android.app.PendingIntent;
import android.app.assist.AssistStructure;
import android.content.Intent;
import android.content.IntentSender;
import android.os.Build;
import android.os.CancellationSignal;
import android.service.autofill.AutofillService;
import android.service.autofill.Dataset;
import android.service.autofill.FillCallback;
import android.service.autofill.FillContext;
import android.service.autofill.FillRequest;
import android.service.autofill.FillResponse;
import android.service.autofill.SaveCallback;
import android.service.autofill.SaveInfo;
import android.service.autofill.SaveRequest;
import android.view.autofill.AutofillId;
import android.view.autofill.AutofillValue;
import android.widget.RemoteViews;

import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

@RequiresApi(api = Build.VERSION_CODES.O)
public class BsrAutofillService extends AutofillService {

    @Override
    public void onFillRequest(@NonNull FillRequest request,
                              @NonNull CancellationSignal signal,
                              @NonNull FillCallback callback) {

        List<FillContext> contexts = request.getFillContexts();
        AssistStructure structure = contexts.get(contexts.size() - 1).getStructure();

        ParsedFields fields = parseStructure(structure);
        if (fields.usernameId == null && fields.passwordId == null) {
            callback.onSuccess(null);
            return;
        }

        String packageName = structure.getActivityComponent().getPackageName();
        List<VaultEntry> matches = findMatches(packageName);

        FillResponse.Builder responseBuilder = new FillResponse.Builder();

        // Save prompt — user ne naya login kiya to save karne ka option
        if (fields.usernameId != null && fields.passwordId != null) {
            responseBuilder.setSaveInfo(new SaveInfo.Builder(
                    SaveInfo.SAVE_DATA_TYPE_USERNAME | SaveInfo.SAVE_DATA_TYPE_PASSWORD,
                    new AutofillId[]{fields.usernameId, fields.passwordId}
            ).build());
        }

        if (matches.isEmpty()) {
            // Koi match nahi — vault open karne ka option
            Intent intent = new Intent(this, MainActivity.class);
            intent.putExtra("autofill_package", packageName);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pi = PendingIntent.getActivity(this, 1001, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            Dataset ds = buildDataset(fields, "", "",
                    "BabaSitaRam Pro", "Vault kholein", pi.getIntentSender());
            if (ds != null) responseBuilder.addDataset(ds);
        } else {
            for (VaultEntry entry : matches) {
                Dataset ds = buildDataset(fields, entry.user, entry.pw,
                        entry.site, entry.user, null);
                if (ds != null) responseBuilder.addDataset(ds);
            }
        }

        try {
            callback.onSuccess(responseBuilder.build());
        } catch (Exception e) {
            callback.onSuccess(null);
        }
    }

    @Override
    public void onSaveRequest(@NonNull SaveRequest request, @NonNull SaveCallback callback) {
        callback.onSuccess();
    }

    private Dataset buildDataset(ParsedFields fields, String user, String pw,
                                  String title, String subtitle, IntentSender auth) {
        try {
            RemoteViews rv = buildPresentation(title, subtitle);
            Dataset.Builder ds = new Dataset.Builder(rv);
            if (auth != null) ds.setAuthentication(auth);
            if (fields.usernameId != null)
                ds.setValue(fields.usernameId, AutofillValue.forText(user), rv);
            if (fields.passwordId != null)
                ds.setValue(fields.passwordId, AutofillValue.forText(pw), rv);
            return ds.build();
        } catch (Exception e) {
            return null;
        }
    }

    // ── Structure parse — username/password fields dhundho ──
    private ParsedFields parseStructure(AssistStructure structure) {
        ParsedFields fields = new ParsedFields();
        for (int i = 0; i < structure.getWindowNodeCount(); i++) {
            traverseNode(structure.getWindowNodeAt(i).getRootViewNode(), fields);
        }
        return fields;
    }

    private void traverseNode(AssistStructure.ViewNode node, ParsedFields fields) {
        for (int i = 0; i < node.getChildCount(); i++) {
            traverseNode(node.getChildAt(i), fields);
        }

        if (node.getAutofillId() == null) return;

        String hint = node.getHint() != null ? node.getHint().toLowerCase() : "";
        String idEntry = node.getIdEntry() != null ? node.getIdEntry().toLowerCase() : "";
        String className = node.getClassName() != null ? node.getClassName().toLowerCase() : "";
        int inputType = node.getInputType();
        int typeClass = inputType & android.text.InputType.TYPE_MASK_CLASS;
        int typeVar   = inputType & android.text.InputType.TYPE_MASK_VARIATION;

        boolean isText = typeClass == android.text.InputType.TYPE_CLASS_TEXT
                || className.contains("edittext");
        if (!isText) return;

        boolean isPassword =
                typeVar == android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD ||
                typeVar == android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
                typeVar == android.text.InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
                hint.contains("password") || hint.contains("pass") || hint.contains("pwd") ||
                idEntry.contains("password") || idEntry.contains("pass") || idEntry.contains("pwd");

        boolean isUsername = !isPassword && (
                typeVar == android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS ||
                typeVar == android.text.InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS ||
                hint.contains("email") || hint.contains("user") || hint.contains("login") ||
                hint.contains("phone") || hint.contains("mobile") || hint.contains("username") ||
                idEntry.contains("email") || idEntry.contains("user") || idEntry.contains("login") ||
                idEntry.contains("phone") || idEntry.contains("username"));

        if (isPassword && fields.passwordId == null)
            fields.passwordId = node.getAutofillId();
        else if (isUsername && fields.usernameId == null)
            fields.usernameId = node.getAutofillId();
    }

    // ── Package name se domain extract karke match karo ──
    private List<VaultEntry> findMatches(String packageName) {
        List<VaultEntry> result = new ArrayList<>();
        try {
            String raw = getSharedPreferences("WebViewAppPrefs", MODE_PRIVATE)
                    .getString("vx3_passwords", null);
            if (raw == null) return result;

            // com.google.android → "google"
            String[] parts = packageName.split("\\.");
            String pkgDomain = parts.length >= 2 ? parts[1].toLowerCase() : packageName.toLowerCase();

            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                String site = obj.optString("site", "").toLowerCase()
                        .replace("www.", "").replace("https://", "").replace("http://", "");
                String url  = obj.optString("url", "").toLowerCase()
                        .replace("www.", "").replace("https://", "").replace("http://", "");
                String user = obj.optString("user", "");
                String pw   = obj.optString("pw", "");

                boolean match = site.contains(pkgDomain) || pkgDomain.contains(site)
                        || url.contains(pkgDomain) || packageName.contains(site);

                if (match && (!user.isEmpty() || !pw.isEmpty())) {
                    result.add(new VaultEntry(obj.optString("site", site), user, pw));
                    if (result.size() >= 5) break;
                }
            }
        } catch (Exception ignored) {}
        return result;
    }

    private RemoteViews buildPresentation(String title, String subtitle) {
        RemoteViews rv = new RemoteViews(getPackageName(), android.R.layout.simple_list_item_2);
        rv.setTextViewText(android.R.id.text1, title != null ? title : "");
        rv.setTextViewText(android.R.id.text2, subtitle != null ? subtitle : "");
        return rv;
    }

    static class ParsedFields {
        AutofillId usernameId;
        AutofillId passwordId;
    }

    static class VaultEntry {
        String site, user, pw;
        VaultEntry(String s, String u, String p) { site = s; user = u; pw = p; }
    }
}
