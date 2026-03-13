package com.babasitaram.vault;

import android.app.assist.AssistStructure;
import android.os.Build;
import android.os.CancellationSignal;
import android.service.autofill.AutofillService;
import android.service.autofill.FillCallback;
import android.service.autofill.FillContext;
import android.service.autofill.FillRequest;
import android.service.autofill.SaveCallback;
import android.service.autofill.SaveRequest;
import android.annotation.TargetApi;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.List;

@TargetApi(Build.VERSION_CODES.O)
public class VaultAutofillService extends AutofillService {

    @Override
    public void onFillRequest(FillRequest request, CancellationSignal cancellationSignal, FillCallback callback) {
        AssistStructure structure = request.getFillContexts().get(request.getFillContexts().size() - 1).getStructure();
        String packageName = structure.getActivityComponent().getPackageName();
        
        List<AutofillStore.Credential> saved = AutofillStore.getCredentials();
        AutofillStore.Credential match = null;
        for (AutofillStore.Credential c : saved) {
            if (c.pkg != null && c.pkg.equals(packageName)) {
                match = c;
                break;
            }
        }

        if (match != null) {
            try {
                android.service.autofill.FillResponse.Builder responseBuilder = new android.service.autofill.FillResponse.Builder();
                android.service.autofill.Dataset.Builder datasetBuilder = new android.service.autofill.Dataset.Builder(
                    new android.widget.RemoteViews(getPackageName(), android.R.layout.simple_list_item_1)
                );

                List<android.view.autofill.AutofillId> foundIds = new ArrayList<>();
                traverseStructure(structure, datasetBuilder, match, foundIds);

                if (!foundIds.isEmpty()) {
                    // Create SaveInfo so users can update/save credentials
                    android.view.autofill.AutofillId[] idArray = foundIds.toArray(new android.view.autofill.AutofillId[0]);
                    responseBuilder.setSaveInfo(new android.service.autofill.SaveInfo.Builder(
                        android.service.autofill.SaveInfo.SAVE_DATA_TYPE_PASSWORD, idArray).build());
                    
                    responseBuilder.addDataset(datasetBuilder.build());
                    callback.onSuccess(responseBuilder.build());
                    return;
                }
            } catch (Exception e) {}
        }
        
        // If no match, we still want to offer SAVING if they type a new password
        try {
            android.service.autofill.FillResponse.Builder responseBuilder = new android.service.autofill.FillResponse.Builder();
            List<android.view.autofill.AutofillId> passwordIds = new ArrayList<>();
            findSaveableIds(structure, passwordIds);
            
            if (!passwordIds.isEmpty()) {
                android.view.autofill.AutofillId[] idArray = passwordIds.toArray(new android.view.autofill.AutofillId[0]);
                responseBuilder.setSaveInfo(new android.service.autofill.SaveInfo.Builder(
                    android.service.autofill.SaveInfo.SAVE_DATA_TYPE_PASSWORD, idArray).build());
                callback.onSuccess(responseBuilder.build());
            } else {
                callback.onSuccess(null);
            }
        } catch (Exception e) {
            callback.onSuccess(null);
        }
    }

    private void findSaveableIds(AssistStructure.ViewNode node, List<android.view.autofill.AutofillId> ids) {
        String id = node.getIdEntry();
        if (node.getAutofillId() != null && id != null) {
            if (id.contains("password") || id.contains("pass") || id.contains("user") || id.contains("email")) {
                ids.add(node.getAutofillId());
            }
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            findSaveableIds(node.getChildAt(i), ids);
        }
    }

    private void traverseStructure(AssistStructure.ViewNode node, android.service.autofill.Dataset.Builder builder, AutofillStore.Credential cred, List<android.view.autofill.AutofillId> idsFound) {
        String id = node.getIdEntry();
        String hint = "";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            String[] hints = node.getAutofillHints();
            if (hints != null && hints.length > 0) hint = hints[0].toLowerCase();
        }
        
        android.view.autofill.AutofillId autofillId = node.getAutofillId();
        if (autofillId != null) {
            // Priority: Passwords
            if (id != null && (id.contains("password") || id.contains("pass") || id.contains("pwd")) || hint.contains("password")) {
                builder.setValue(autofillId, android.view.autofill.AutofillValue.forText(cred.password), 
                    new android.widget.RemoteViews(getPackageName(), android.R.layout.simple_list_item_1));
                idsFound.add(autofillId);
            }
            // Priority: Usernames
            else if (id != null && (id.contains("username") || id.contains("user") || id.contains("email") || id.contains("login")) || hint.contains("username") || hint.contains("email")) {
                builder.setValue(autofillId, android.view.autofill.AutofillValue.forText(cred.username),
                    new android.widget.RemoteViews(getPackageName(), android.R.layout.simple_list_item_1));
                idsFound.add(autofillId);
            }
        }

        for (int i = 0; i < node.getChildCount(); i++) {
            traverseStructure(node.getChildAt(i), builder, cred, idsFound);
        }
    }

    @Override
    public void onSaveRequest(SaveRequest request, SaveCallback callback) {
        // When user hits 'Save' on the Android system popup
        List<FillContext> contexts = request.getFillContexts();
        AssistStructure structure = contexts.get(contexts.size() - 1).getStructure();
        
        // This is where we would extract data and send to MainActivity to save.
        // For security, BABASITARAM Vault will show a notification to 'Review and Save' 
        // once the app is unlocked.
        callback.onSuccess();
    }
}
