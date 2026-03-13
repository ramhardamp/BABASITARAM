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
                int nodes = structure.getWindowNodeCount();
                for (int i = 0; i < nodes; i++) {
                    traverseStructure(structure.getWindowNodeAt(i).getRootViewNode(), datasetBuilder, match, foundIds);
                }

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
            int nodes = structure.getWindowNodeCount();
            for (int i = 0; i < nodes; i++) {
                findSaveableIds(structure.getWindowNodeAt(i).getRootViewNode(), passwordIds);
            }
            
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
        if (node == null) return;
        String idEntry = node.getIdEntry();
        if (node.getAutofillId() != null && idEntry != null) {
            String idLower = idEntry.toLowerCase();
            if (idLower.contains("password") || idLower.contains("pass") || idLower.contains("user") || idLower.contains("email")) {
                ids.add(node.getAutofillId());
            }
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            findSaveableIds(node.getChildAt(i), ids);
        }
    }

    private void traverseStructure(AssistStructure.ViewNode node, Dataset.Builder builder, AutofillStore.Credential cred, List<AutofillId> idsFound) {
        if (node == null) return;
        String idEntry = node.getIdEntry();
        String hint = "";
        String[] hints = node.getAutofillHints();
        if (hints != null && hints.length > 0) hint = hints[0].toLowerCase();
        
        AutofillId autofillId = node.getAutofillId();
        if (autofillId != null) {
            if (idEntry != null) {
                String idLower = idEntry.toLowerCase();
                if (idLower.contains("password") || idLower.contains("pass") || idLower.contains("pwd") || hint.contains("password")) {
                    builder.setValue(autofillId, AutofillValue.forText(cred.password), 
                        new RemoteViews(getPackageName(), android.R.layout.simple_list_item_1));
                    idsFound.add(autofillId);
                }
                else if (idLower.contains("username") || idLower.contains("user") || idLower.contains("email") || idLower.contains("login") || hint.contains("username") || hint.contains("email")) {
                    builder.setValue(autofillId, AutofillValue.forText(cred.username),
                        new RemoteViews(getPackageName(), android.R.layout.simple_list_item_1));
                    idsFound.add(autofillId);
                }
            }
        }

        for (int i = 0; i < node.getChildCount(); i++) {
            traverseStructure(node.getChildAt(i), builder, cred, idsFound);
        }
    }

    @Override
    public void onSaveRequest(SaveRequest request, SaveCallback callback) {
        callback.onSuccess();
    }
}
