# 🏆 House Cup SaaS — Multi-School Edition

## 🌟 What's New in This Version:

### 1. First Screen: School Code Entry & Add School
* When you launch the app, the first screen provides two clear paths:
  1. **Enter School Code:** Type your School Code (e.g. `OAK-01` or `GWH-01`) and click **`Enter School`** to jump straight into your school's live scoreboard and login!
  2. **Add / Register New School:** Click **`➕ Add / Register New School`** to register a new campus.
  3. If schools have already been registered, a dropdown allows selecting directly from your saved schools.

---

### 2. Zero Hardcoded House Templates (Admin Decides Number & Names of Houses)
* **No more fixed templates:** There are no hardcoded "Gems", "Beasts", or "Tri-House" presets!
* When creating a school, the Admin defines the house system freely:
  * Click **`+ Add House`** to add 2, 3, 4, 5, 6, 7, 8... as many houses as the school uses!
  * Choose the **Color** for each house with the color picker.
  * Type the **House Name** (e.g. `Phoenix`, `Lions`, `Spartans`, `Vikings`, `Red House`, etc.).
  * Remove any house with the **✕** button.

---

### 3. You Decide Your Own Admin Code
* During school setup, there is an input field:
  ```text
  🔐 Set Your Admin Security Code / PIN
  [ Enter your chosen Admin Code (e.g. 9988 or mySecret) ]
  ```
* **No hardcoded defaults:** Only the exact code you choose will unlock the School Admin Portal for that school.
* You can also view and edit your Admin Code at any time in the **🏫 Profile Tab** of the Admin Portal.

---

### 4. Previous-Style Rich Admin Portal (Add School Tab Removed)
The Admin Panel features the full, rich layout from the previous design, with the "Add School" tab **removed** so admins only manage their active campus:
* **🏫 Profile Tab:** School Name, Motto, School Code, and your **Admin Security Code / PIN**.
* **🛡️ Houses Tab:** Dynamic house table (live points, color dots, emblems), plus `+ Add House` modal with color palette presets and a custom color picker!
* **📋 Criteria Tab:** Manage custom positive awards and negative infractions.
* **👥 Roster & Paste Excel (Strictly Admin Only):**
  - **Paste Student Data from Excel / Google Sheets:** Copy 4 columns (`Name [Tab] Grade [Tab] Division [Tab] House`), paste (Ctrl+V), and click `Import Students from Excel`. All students are automatically sorted Grade-wise (numeric, 9 < 10) then Division-wise (A < B < C)!
  - **Paste Teacher Data from Excel:** Copy columns (`Username [Tab] Password [Tab] Display Name`), paste, and import staff accounts in seconds!
* **🏆 Term & Reset Tab:** Conclude the academic term, record the winner into permanent history, reset house scores to 0, and export CSV/JSON reports.

---

### 5. Main App UI & Sorting: 100% Identical to Original App
* **Exact Same 4 Screens:**
  1. `screen-login`: Same crest logo, `HOUSE CUP` title, Teacher/Student toggle, Username/Password inputs, student name input (no placeholder hints), and subtle `🔒 Admin Login` button in the footer.
  2. `screen-home`: Same `top-nav`, `HOUSE CUP`, `Sync` indicator, session name, scoreboard table (`Rk`, `House`, `Pts`, `Live`), recent activity cards, and yellow `+ Points` floating action button.
  3. `screen-search`: Same Find Student screen with search input and filter dropdowns for **Grade**, **House**, and **Division**.
  4. `screen-action`: Same Update Points screen with selected student card, Add/Deduct toggle, criteria radio circles, "Other" custom reason box, point chips (10, 20, 50), and footer button.
* **Exact Same Sorting:**
  - **Scoreboard:** Sorted descending by points (Rank 1 at top).
  - **Students:** Sorted strictly **Grade-wise** (Grade 9 before 10), then **Division-wise** (A &rarr; B &rarr; C), then Name!

---

## 🚀 How to Test
1. Open folder: `C:\Users\Dell\OneDrive\Desktop\HouseCupSaaS`
2. Double-click [**`index.html`**](file:///C:/Users/Dell/OneDrive/Desktop/HouseCupSaaS/index.html) to open in your browser.
3. You will see the **School Code Entry** screen. Click **`➕ Add / Register New School`**, enter your school name, set your **own Admin Code**, and add as many custom houses as you like!
