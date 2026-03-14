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

// Android 8.0+ (API 26) required
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

        // ── Save Info — user ne naya login kiya to save karne ka option ──
        if (fields.usernameId != null && fields.passwordId != null) {
            AutofillId[] saveIds = new AutofillId[]{fields.usernameId, fields.passwordId};
            SaveInfo saveInfo = new SaveInfo.Builder(
                    SaveInfo.SAVE_DATA_TYPE_USERNAME | SaveInfo.SAVE_DATA_TYPE_PASSWORD,
                    saveIds
            ).build();
            responseBuilder.setSaveInfo(saveInfo);
        }

        if (matches.isEmpty()) {
            // Koi match nahi — vault open karne ka option do
            Intent authIntent = new Intent(this, MainActivity.class);
            authIntent.putExtra("autofill_package", packageName);
            authIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pi = PendingIntent.getActivity(this, 1001, authIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            Dataset ds = buildDataset(fields, "", "",
                    "BabaSitaRam Pro", "Vault kholein", pi.getIntentSender(), request);
            if (ds != null) responseBuilder.addDataset(ds);
        } else {
            for (VaultEntry entry : matches) {
                Dataset ds = buildDataset(fields, entry.user, entry.pw,
                        entry.site, entry.user, null, request);
                if (ds != null) responseBuilder.addDataset(ds);
            }
        }

        try {
            callback.onSuccess(responseBuilder.build());
        } catch (Exception e) {
            callback.onSuccess(null);
        }
    }

    // ── Dataset builder — inline (Android 11+) + dropdown dono support ──
    private Dataset buildDataset(ParsedFields fields, String user, String pw,
                                  String title, String subtitle,
                                  IntentSender auth, FillRequest request) {
        try {
            RemoteViews presentation = buildPresentation(title, subtitle);
            Dataset.Builder ds = new Dataset.Builder(presentation);

            if (auth != null) ds.setAuthentication(auth);

            if (fields.usernameId != null)
                ds.setValue(fields.usernameId, AutofillValue.forText(user), presentation);
            if (fields.passwordId != null)
                ds.setValue(fields.passwordId, AutofillValue.forText(pw), presentation);

            // Android 11+ — inline suggestion (keyboard ke upar chip)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                addInlineSuggestions(ds, fields, user, pw, title, subtitle, request);
            }

            return ds.build();
        } catch (Exception e) {
            return null;
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.R)
    private void addInlineSuggestions(Dataset.Builder ds, ParsedFields fields,
                                       String user, String pw,
                                       String title, String subtitle,
                                       FillRequest request) {
        try {
            android.service.autofill.InlineSuggestionsRequest inlineReq =
                    request.getInlineSuggestionsRequest();
            if (inlineReq == null) return;

            List<android.app.slice.Slice> specs = inlineReq.getInlinePresentationSpecs() != null
                    ? new ArrayList<>() : null;
            if (specs == null) return;

            List<android.view.inputmethod.InlineSuggestionsRequest> imeSpecs =
                    inlineReq.getInlinePresentationSpecs();
            if (imeSpecs == null || imeSpecs.isEmpty()) return;

            android.service.autofill.InlinePresentation inlinePresentation =
                    buildInlinePresentation(title, subtitle,
                            (android.widget.inline.InlinePresentationSpec) imeSpecs.get(0));
            if (inlinePresentation == null) return;

            if (fields.usernameId != null)
                ds.setValue(fields.usernameId, AutofillValue.forText(user),
                        buildPresentation(title, subtitle), inlinePresentation);
            if (fields.passwordId != null)
                ds.setValue(fields.passwordId, AutofillValue.forText(pw),
                        buildPresentation(title, subtitle), inlinePresentation);
        } catch (Exception ignored) {}
    }

    @RequiresApi(api = Build.VERSION_CODES.R)
    private android.service.autofill.InlinePresentation buildInlinePresentation(
            String title, String subtitle, android.widget.inline.InlinePresentationSpec spec) {
        try {
            androidx.autofill.inline.v1.InlineSuggestionUi.Content content =
                    androidx.autofill.inline.v1.InlineSuggestionUi.newContentBuilder(
                            PendingIntent.getActivity(this, 0,
                                    new Intent(this, MainActivity.class),
                                    PendingIntent.FLAG_IMMUTABLE))
                            .setTitle(title)
                            .setSubtitle(subtitle)
                            .build();
            return new android.service.autofill.InlinePresentation(
                    content.getSlice(), spec, false);
        } catch (Exception e) {
            return null;
        }
    }

    // ── Save request — user ne naya password enter kiya ──
    @Override
    public void onSaveRequest(@NonNull SaveRequest request, @NonNull SaveCallback callback) {
        // Future: yahan naya password vault mein save kar sakte hain
        callback.onSuccess();
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
        // Pehle children traverse karo
        for (int i = 0; i < node.getChildCount(); i++) {
            traverseNode(node.getChildAt(i), fields);
        }

        // Sirf fillable fields check karo
        if (node.getAutofillId() == null) return;

        String hint = node.getHint() != null ? node.getHint().toLowerCase() : "";
        String idEntry = node.getIdEntry() != null ? node.getIdEntry().toLowerCase() : "";
        String className = node.getClassName() != null ? node.getClassName().toLowerCase() : "";
        int inputType = node.getInputType();
        int typeClass = inputType & android.text.InputType.TYPE_MASK_CLASS;
        int typeVar = inputType & android.text.InputType.TYPE_MASK_VARIATION;

        boolean isText = typeClass == android.text.InputType.TYPE_CLASS_TEXT
                || className.contains("edittext");
        if (!isText) return;

        boolean isPassword =
                typeVar == android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD ||
                typeVar == android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
                typeVar == android.text.InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
                hint.contains("password") || hint.contains("passwort") ||
                hint.contains("pass") || hint.contains("pwd") || hint.contains("sandi") ||
                idEntry.contains("password") || idEntry.contains("pass") || idEntry.contains("pwd");

        boolean isUsername = !isPassword && (
                typeVar == android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS ||
                typeVar == android.text.InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS ||
                hint.contains("email") || hint.contains("user") || hint.contains("login") ||
                hint.contains("phone") || hint.contains("mobile") || hint.contains("username") ||
                hint.contains("id") || hint.contains("account") ||
                idEntry.contains("email") || idEntry.contains("user") || idEntry.contains("login") ||
                idEntry.contains("phone") || idEntry.contains("username") || idEntry.contains("account"));

        if (isPassword && fields.passwordId == null)
            fields.passwordId = node.getAutofillId();
        else if (isUsername && fields.usernameId == null)
            fields.usernameId = node.getAutofillId();
    }

    // ── SharedPreferences se passwords padho, package name se match karo ──
    private List<VaultEntry> findMatches(String packageName) {
        List<VaultEntry> result = new ArrayList<>();
        try {
            String raw = getSharedPreferences("WebViewAppPrefs", MODE_PRIVATE)
                    .getString("vx3_passwords", null);
            if (raw == null) return result;

            // Package name se domain extract karo: com.google.android → google
            String[] parts = packageName.split("\\.");
            String pkgDomain = parts.length >= 2 ? parts[1].toLowerCase() : packageName.toLowerCase();

            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                String site = obj.optString("site", "").toLowerCase()
                        .replace("www.", "").replace("https://", "").replace("http://", "");
                String url = obj.optString("url", "").toLowerCase()
                        .replace("www.", "").replace("https://", "").replace("http://", "");
                String user = obj.optString("user", "");
                String pw = obj.optString("pw", "");

                // Domain-based matching — "google" matches "google.com", "accounts.google.com"
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
