# Requirements Document

## Introduction

Grocery Getter is a household-based grocery list and pantry manager web application. It enables families and shared households to collaboratively manage a product catalog, maintain shopping lists organized by store, and coordinate shopping trips in real time. Any household member can add products to the catalog via UPC barcode scanning or manual entry, build shopping lists from that catalog, and check off items while at the store. The app targets mobile-friendly web browsers and is built with a React/Vite frontend and a FastAPI/PostgreSQL backend.

## Glossary

- **User**: An authenticated individual with an email/password account.
- **Household**: A shared workspace that groups Users together. All catalog, store, and list data is scoped to a Household.
- **Product**: An item in the Household's catalog, identified by a UPC barcode or manually created, with a name, brand, quantity/weight, preferred store, and optional photo.
- **UPC**: Universal Product Code — a barcode that uniquely identifies a product.
- **Open_Food_Facts**: A free, open product database queried by UPC to auto-populate product metadata.
- **Catalog**: The Household's collection of Products.
- **Store**: A named retail location associated with a Household, used to tag Products and group Shopping Lists.
- **Shopping_List**: A per-store list of Products that one or more Household members intend to purchase.
- **List_Item**: A single entry on a Shopping_List, referencing a Product with a desired quantity and a checked/unchecked state.
- **Shopping_Mode**: The in-store experience where a User scans or checks off List_Items in real time.
- **Invitation**: A mechanism by which an existing Household member invites a new User to join the Household.
- **Auth_Service**: The backend component responsible for user registration, login, and session management.
- **Catalog_Service**: The backend component responsible for managing the Household's Product catalog.
- **List_Service**: The backend component responsible for managing Shopping_Lists and List_Items.
- **Barcode_Scanner**: The frontend component that uses ZXing-js to decode UPC barcodes via the device camera.
- **Photo_Store**: The external storage service (e.g., Supabase Storage or Cloudflare R2) used to persist product photos.

---

## Requirements

### Requirement 1: User Registration and Authentication

**User Story:** As a new user, I want to create an account with my email and password, so that I can securely access my household's data.

#### Acceptance Criteria

1. THE Auth_Service SHALL accept a registration request containing an email address and a password of at least 8 characters.
2. WHEN a registration request is received with a valid email and password, THE Auth_Service SHALL create a new User account and return a session token.
3. IF a registration request is received with an email address already associated with an existing account, THEN THE Auth_Service SHALL return an error indicating the email is already in use.
4. IF a registration request is received with a password shorter than 8 characters, THEN THE Auth_Service SHALL return an error describing the password requirement.
5. WHEN a login request is received with a valid email and correct password, THE Auth_Service SHALL return a session token valid for at least 24 hours.
6. IF a login request is received with an unrecognized email or incorrect password, THEN THE Auth_Service SHALL return an authentication error without specifying which field is incorrect.
7. WHILE a User holds a valid session token, THE Auth_Service SHALL authenticate all subsequent API requests bearing that token.
8. WHEN a session token expires, THE Auth_Service SHALL reject requests bearing that token and return an unauthenticated error.

---

### Requirement 2: Household Creation and Management

**User Story:** As a user, I want to create or join a household, so that I can share a product catalog and shopping lists with my family.

#### Acceptance Criteria

1. WHEN an authenticated User submits a household creation request with a household name, THE Auth_Service SHALL create a new Household and assign the User as its first member.
2. THE Auth_Service SHALL ensure each User belongs to at most one Household at a time.
3. WHEN an authenticated Household member submits an invitation for a given email address, THE Auth_Service SHALL generate a unique Invitation link and send it to that email address.
4. WHEN a User follows a valid Invitation link and completes registration or login, THE Auth_Service SHALL add the User to the associated Household.
5. IF an Invitation link has already been used or has expired after 7 days, THEN THE Auth_Service SHALL reject the invitation and return an error.
6. WHEN an authenticated User who does not belong to any Household attempts to access Catalog or List data, THE Auth_Service SHALL return an authorization error.

---

### Requirement 3: Product Catalog — UPC Scanning and Lookup

**User Story:** As a household member, I want to scan a product's barcode with my phone camera, so that the product details are automatically populated from an external database.

#### Acceptance Criteria

1. WHEN the User activates the barcode scanner, THE Barcode_Scanner SHALL request access to the device camera and display a live viewfinder.
2. WHEN the Barcode_Scanner detects a valid UPC in the camera feed, THE Barcode_Scanner SHALL decode the UPC and pass it to the Catalog_Service for lookup.
3. WHEN the Catalog_Service receives a UPC lookup request, THE Catalog_Service SHALL query the Open_Food_Facts API for that UPC.
4. WHEN the Open_Food_Facts API returns a matching product, THE Catalog_Service SHALL pre-populate the product name, brand, and quantity/weight fields and present them to the User for confirmation.
5. IF the Open_Food_Facts API returns no match for the UPC, THEN THE Catalog_Service SHALL present the User with a manual entry form pre-filled with the scanned UPC.
6. IF the Open_Food_Facts API is unreachable, THEN THE Catalog_Service SHALL present the User with a manual entry form and display a message indicating the lookup service is unavailable.
7. WHEN a UPC is scanned and the UPC already exists in the Household's Catalog, THE Catalog_Service SHALL present the existing Product to the User and offer to add it to the Shopping_List instead of creating a duplicate.

---

### Requirement 4: Product Catalog — Manual Entry and Photo

**User Story:** As a household member, I want to manually enter a product's details and attach a photo, so that products not found in the barcode database are still usable in our catalog.

#### Acceptance Criteria

1. THE Catalog_Service SHALL accept a product creation request containing at minimum a product name and a preferred Store.
2. WHEN a product creation request includes a quantity/weight value, THE Catalog_Service SHALL store that value alongside the product name and brand.
3. WHERE a User provides a photo during product creation, THE Catalog_Service SHALL upload the photo to the Photo_Store and associate the returned URL with the Product.
4. WHEN a product is saved to the Catalog, THE Catalog_Service SHALL make it immediately visible to all members of the same Household.
5. WHEN an authenticated Household member submits an update to an existing Product's name, brand, quantity/weight, preferred store, or photo, THE Catalog_Service SHALL persist the changes and reflect them for all Household members.
6. WHEN an authenticated Household member deletes a Product from the Catalog, THE Catalog_Service SHALL remove the Product and all associated List_Items referencing it.

---

### Requirement 5: Store Management

**User Story:** As a household member, I want to add and name the stores where we shop, so that products and shopping lists can be organized by store.

#### Acceptance Criteria

1. WHEN an authenticated Household member submits a store creation request with a store name, THE Catalog_Service SHALL create a new Store scoped to that Household.
2. THE Catalog_Service SHALL ensure Store names are unique within a Household.
3. IF a store creation request is received with a name that already exists in the Household, THEN THE Catalog_Service SHALL return an error indicating the name is already in use.
4. WHEN an authenticated Household member renames a Store, THE Catalog_Service SHALL update the Store name and reflect the change on all associated Products and Shopping_Lists.
5. WHEN an authenticated Household member deletes a Store, THE Catalog_Service SHALL remove the Store and unset the preferred store on all Products that referenced it.

---

### Requirement 6: Shopping List — Building the List

**User Story:** As a household member, I want to add products to the shopping list by browsing the catalog or scanning a barcode, so that I can quickly capture what we need to buy.

#### Acceptance Criteria

1. WHEN an authenticated Household member selects a Product from the Catalog and submits an add-to-list request, THE List_Service SHALL create a List_Item on the Shopping_List for the Product's preferred Store with a default quantity of 1.
2. WHEN an add-to-list request includes an explicit quantity, THE List_Service SHALL use that quantity instead of the default.
3. IF a List_Item for the same Product already exists on the active Shopping_List for that Store, THEN THE List_Service SHALL increment the existing List_Item's quantity rather than creating a duplicate entry.
4. WHEN the Barcode_Scanner decodes a UPC and the UPC matches a Product in the Household Catalog, THE List_Service SHALL present the User with an option to add that Product to the Shopping_List.
5. WHEN the Barcode_Scanner decodes a UPC and the UPC does not match any Product in the Household Catalog, THE List_Service SHALL redirect the User to the product creation flow before offering to add the new Product to the Shopping_List.
6. WHEN an authenticated Household member removes a List_Item from the Shopping_List, THE List_Service SHALL delete that List_Item.
7. WHEN an authenticated Household member updates the quantity of a List_Item, THE List_Service SHALL persist the new quantity immediately.

---

### Requirement 7: Shopping List — Per-Store Grouping

**User Story:** As a household member, I want the shopping list to be automatically organized by store, so that I can shop efficiently at each location.

#### Acceptance Criteria

1. THE List_Service SHALL group List_Items by the preferred Store of their associated Product.
2. WHEN a User views the Shopping_List, THE List_Service SHALL present one list section per Store containing only the List_Items whose Product's preferred Store matches that Store.
3. WHEN a Product's preferred Store is updated, THE List_Service SHALL move all active List_Items for that Product to the section corresponding to the new Store.
4. WHEN a Product has no preferred Store assigned, THE List_Service SHALL place its List_Items in an "Unassigned" section.

---

### Requirement 8: Shopping Mode — Real-Time Collaboration

**User Story:** As a household member at the store, I want to check off items as I put them in the cart and see updates from other members in real time, so that we don't duplicate purchases.

#### Acceptance Criteria

1. WHEN a User enters Shopping_Mode for a specific Store, THE List_Service SHALL display all unchecked List_Items for that Store's Shopping_List.
2. WHEN a User marks a List_Item as checked, THE List_Service SHALL update the List_Item's state to checked and broadcast the change to all Household members currently viewing that Shopping_List within 2 seconds.
3. WHEN a User marks a List_Item as unchecked, THE List_Service SHALL update the List_Item's state to unchecked and broadcast the change to all Household members currently viewing that Shopping_List within 2 seconds.
4. WHILE a User is in Shopping_Mode, THE List_Service SHALL reflect any List_Item additions or removals made by other Household members within 2 seconds.
5. WHEN the Barcode_Scanner decodes a UPC while in Shopping_Mode and the UPC matches a List_Item on the active Shopping_List, THE List_Service SHALL mark that List_Item as checked and prompt the User to confirm or adjust the quantity.
6. IF the device loses network connectivity while in Shopping_Mode, THEN THE List_Service SHALL display a connectivity warning and queue local check-off actions for synchronization when connectivity is restored.

---

### Requirement 9: Shopping Mode — Scan to Check Off

**User Story:** As a household member at the store, I want to scan an item's barcode to check it off the list, so that I don't have to manually find and tap each item.

#### Acceptance Criteria

1. WHEN the User activates the Barcode_Scanner in Shopping_Mode, THE Barcode_Scanner SHALL decode the UPC and pass it to the List_Service.
2. WHEN the List_Service receives a UPC that matches a List_Item on the active Shopping_List, THE List_Service SHALL mark that List_Item as checked.
3. IF the List_Service receives a UPC that does not match any List_Item on the active Shopping_List, THEN THE List_Service SHALL display a message indicating the scanned item is not on the current list.
4. WHEN a List_Item is checked via scan, THE List_Service SHALL prompt the User to confirm or adjust the quantity before finalizing the check-off.

---

### Requirement 10: List Completion and Reset

**User Story:** As a household member, I want to clear the checked items or reset the list after a shopping trip, so that the list is ready for the next shopping session.

#### Acceptance Criteria

1. WHEN an authenticated Household member submits a "clear checked items" request for a Store's Shopping_List, THE List_Service SHALL remove all List_Items with a checked state from that list.
2. WHEN an authenticated Household member submits a "reset list" request for a Store's Shopping_List, THE List_Service SHALL set all List_Items on that list to unchecked.
3. WHEN a "clear checked items" or "reset list" action is performed, THE List_Service SHALL broadcast the updated list state to all Household members currently viewing that Shopping_List within 2 seconds.

---

### Requirement 11: Product Photo Storage

**User Story:** As a household member, I want product photos to be stored reliably and served quickly, so that the catalog is visually useful on mobile devices.

#### Acceptance Criteria

1. WHEN a product photo is submitted, THE Catalog_Service SHALL upload the photo to the Photo_Store and store the resulting URL in the Product record.
2. THE Catalog_Service SHALL accept product photos in JPEG or PNG format with a maximum file size of 5 MB.
3. IF a photo upload to the Photo_Store fails, THEN THE Catalog_Service SHALL return an error to the User and not save the Product without a photo when a photo was explicitly provided.
4. WHEN a Product is deleted, THE Catalog_Service SHALL delete the associated photo from the Photo_Store.

---

### Requirement 12: Open Food Facts API Integration

**User Story:** As a developer, I want the product lookup to use the Open Food Facts API consistently, so that product data is reliably auto-populated from a well-known source.

#### Acceptance Criteria

1. WHEN the Catalog_Service queries the Open_Food_Facts API, THE Catalog_Service SHALL send a GET request to the Open Food Facts product endpoint using the scanned UPC as the identifier.
2. WHEN the Open_Food_Facts API response is received, THE Catalog_Service SHALL extract the product name, brand, and quantity fields if present.
3. IF the Open_Food_Facts API response indicates the product is not found, THEN THE Catalog_Service SHALL treat the lookup as a miss and fall back to manual entry.
4. IF the Open_Food_Facts API returns a response that cannot be parsed, THEN THE Catalog_Service SHALL log the error and fall back to manual entry.
5. THE Catalog_Service SHALL complete the Open_Food_Facts API lookup and return a result to the frontend within 5 seconds; IF the lookup exceeds 5 seconds, THEN THE Catalog_Service SHALL time out and fall back to manual entry.

---

### Requirement 13: Data Scoping and Authorization

**User Story:** As a household member, I want to be certain that only members of my household can see or modify our catalog and lists, so that our data remains private.

#### Acceptance Criteria

1. THE Catalog_Service SHALL reject any request to read or modify Catalog data unless the requesting User is a member of the Household that owns that data.
2. THE List_Service SHALL reject any request to read or modify Shopping_List data unless the requesting User is a member of the Household that owns that data.
3. IF an authenticated User attempts to access data belonging to a different Household, THEN THE Catalog_Service or List_Service SHALL return an authorization error without revealing that the resource exists.
4. THE Auth_Service SHALL include the User's Household membership in the session token claims so that downstream services can enforce data scoping without an additional database lookup per request.
