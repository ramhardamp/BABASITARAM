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
                android.service.autofill.Dataset.Builder datasetBuilder = new android.service.autofill.Dataset.Builder();
                // Dataset requires at least one field to be built. 
                // Since specific ViewIds depend on the target app UI, 
                // we'll return null for now to avoid crashes until full mapping is done.
                callback.onSuccess(null);
            } catch (Exception e) {
                callback.onSuccess(null);
            }
        } else {
            callback.onSuccess(null);
        }
    }

    @Override
    public void onSaveRequest(SaveRequest request, SaveCallback callback) {
        callback.onSuccess();
    }
}
