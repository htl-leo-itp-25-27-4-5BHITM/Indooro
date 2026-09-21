## MODIFIED Requirements

### Requirement: PDF conversion endpoint returns JSON before persistence
The backend SHALL expose current PDF-to-JSON conversion as an admin-only utility behavior that returns extracted product rows before any catalog persistence step, and SHALL reject request bodies larger than 10 MB.

#### Scenario: PDF file is uploaded
- **GIVEN** an admin uploads a multipart PDF file to `/api/convert/pdf-to-json`
- **WHEN** the file exists and parsing succeeds
- **THEN** the backend returns JSON containing extracted id, name, and layout code fields where available

#### Scenario: No file is uploaded
- **GIVEN** the conversion endpoint receives no usable file from an admin
- **WHEN** the request is processed
- **THEN** the backend returns a bad-request response

#### Scenario: Anonymous upload
- **GIVEN** no authenticated session
- **WHEN** a client uploads a PDF to `/api/convert/pdf-to-json`
- **THEN** the backend responds with HTTP 401 without parsing the file

#### Scenario: Oversized upload
- **GIVEN** an admin uploads a 25 MB file
- **WHEN** the request is received
- **THEN** the backend responds with HTTP 413
