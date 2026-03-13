package com.babasitaram.vault;

import java.util.ArrayList;
import java.util.List;

public class AutofillStore {
    public static class Credential {
        public String title;
        public String username;
        public String password;
        public String mobile;
        public String pkg;
        
        public Credential(String t, String u, String p, String m, String k) {
            title = t; username = u; password = p; mobile = m; pkg = k;
        }
    }

    private static List<Credential> credentials = new ArrayList<>();

    public static void setCredentials(List<Credential> list) {
        credentials = list;
    }

    public static List<Credential> getCredentials() {
        return credentials;
    }
}
