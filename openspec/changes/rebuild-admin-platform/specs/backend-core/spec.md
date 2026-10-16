## ADDED Requirements

### Requirement: Admin recipe edits are lossless
The backend SHALL preserve existing recipe fields and tag assignments when the relevant update input omits them according to the reviewed API contract, and the Admin Platform SHALL reload complete detail before a full replacement update. Ingredient and step mutations SHALL report partial failure explicitly until an atomic operation exists.

#### Scenario: Recipe is edited without changing tags
- **GIVEN** a recipe has tags, image data, ingredients, and steps
- **WHEN** an admin updates another field without intentionally removing those values
- **THEN** a subsequent recipe detail read retains the unchanged values

#### Scenario: Item mutation fails midway
- **WHEN** one ingredient or step operation in a multi-request edit fails
- **THEN** the server reports that failure, later operations are not presented as completed, and the UI can reload the persisted recipe state

### Requirement: Layout version writes resolve concurrent publication
The backend SHALL serialize concurrent save and activation operations for one store and SHALL return a conflict response when it cannot preserve the one-active-version invariant.

#### Scenario: Two admins publish concurrently
- **WHEN** two authorized users publish versions for the same store at the same time
- **THEN** the store has exactly one active version, both requests have explicit outcomes, and no update is silently lost
