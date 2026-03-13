package com.babasitaram.vault;

import android.app.assist.AssistStructure;
import android.os.Build;
import android.os.CancellationSignal;
import android.service.autofill.AutofillService;
import android.service.autofill.FillRequest;
import android.service.autofill.FillCallback;
import android.service.autofill.SaveRequest;
import android.service.autofill.SaveCallback;
import android.service.autofill.FillResponse;
import android.service.autofill.Dataset;
import android.service.autofill.SaveInfo;
import android.service.autofill.FillContext;
import android.view.autofill.AutofillId;
import android.view.autofill.AutofillValue;
import android.annotation.TargetApi;
import android.widget.Toast;
import android.widget.RemoteViews;
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
                FillResponse.Builder responseBuilder = new FillResponse.Builder();
                Dataset.Builder datasetBuilder = new Dataset.Builder(
                    new RemoteViews(getPackageName(), android.R.layout.simple_list_item_1)
                );

                List<AutofillId> foundIds = new ArrayList<>();
                traverseStructure(structure, datasetBuilder, match, foundIds);

                if (!foundIds.isEmpty()) {
                    AutofillId[] idArray = foundIds.toArray(new AutofillId[0]);
                    responseBuilder.setSaveInfo(new SaveInfo.Builder(
                        SaveInfo.SAVE_DATA_TYPE_PASSWORD, idArray).build());
                    
                    responseBuilder.addDataset(datasetBuilder.build());
                    callback.onSuccess(responseBuilder.build());
                    return;
                }
            } catch (Exception e) {}
        }
        
        try {
            FillResponse.Builder responseBuilder = new FillResponse.Builder();
            List<AutofillId> passwordIds = new ArrayList<>();
            findSaveableIds(structure, passwordIds);
            
            if (!passwordIds.isEmpty()) {
                AutofillId[] idArray = passwordIds.toArray(new AutofillId[0]);
                responseBuilder.setSaveInfo(new SaveInfo.Builder(
                    SaveInfo.SAVE_DATA_TYPE_PASSWORD, idArray).build());
                callback.onSuccess(responseBuilder.build());
            } else {
                callback.onSuccess(null);
            }
        } catch (Exception e) {
            callback.onSuccess(null);
        }
    }

    private void findSaveableIds(AssistStructure.ViewNode node, List<AutofillId> ids) {
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

    private void traverseStructure(AssistStructure.ViewNode node, Dataset.Builder builder, AutofillStore.Credential cred, List<AutofillId> idsFound) {
        String id = node.getIdEntry();
        String hint = "";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            String[] hints = node.getAutofillHints();
            if (hints != null && hints.length > 0) hint = hints[0].toLowerCase();
        }
        
        AutofillId autofillId = node.getAutofillId();
        if (autofillId != null) {
            if (id != null && (id.contains("password") || id.contains("pass") || id.contains("pwd")) || hint.contains("password")) {
                builder.setValue(autofillId, AutofillValue.forText(cred.password), 
                    new RemoteViews(getPackageName(), android.R.layout.simple_list_item_1));
                idsFound.add(autofillId);
            }
            else if (id != null && (id.contains("username") || id.contains("user") || id.contains("email") || id.contains("login")) || hint.contains("username") || hint.contains("email")) {
                builder.setValue(autofillId, AutofillValue.forText(cred.username),
                    new RemoteViews(getPackageName(), android.R.layout.simple_list_item_1));
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
