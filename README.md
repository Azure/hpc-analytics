# HPC Visualization
## 1. Achievement & Limitation
Achievement:

    1. HPC cluster's runtime data can be pushed to and presented in PowerBI (PBI) online service continuously.
    2. Rich visuals including two custome visuals is provided, relating to "cluster utility","user usage", and "job & task characteristics".
    3. PBI report and dataset can be deployed automatically.

Limitation:

    1. Azure nodes' price is not taken into account.
    2. Present data volumn is limited by PBI's dataset size, currently is 1GB.
    3. Azure Table storage is not used, as PBI currently does not support changing "storage account" programmatically.
    4. Strong consistency cannot be ensured, as PBI currently does not provide API to read data from dataset.  
    5. Custom visuals do not support interaction such as "click".

## 2. How to Use
Prerequisites & Authentication:

    1. A PowerBI Pro account is needed.
    2. Register a new "native "App in Azure Active Directory (AAD), get "client id", assign the App the permission to Read/Write PowerBI service's all reports/datasets. Remember to click "Grant permissions" after selection.
    3. Set "user name/password, client id" in agent Python script, the agent will refresh access token periodically.

Deploy report & push data:
    
    1. Files needed: "HpcVisualization.pbix" (PBI desktop file, describing report layout/data binding), "HpcDataset.json" (Describing dataset schema and relationship, used for "push dataset" API), "HpcWorkRecord.json" (Recording last pushed data, for resuming interrupted work), all in same directory as agent Python script.
    2. Set all variables' value to "zero" in "HpcWorkRecord.json", then agent will deploy a new report and dataset.
    3. Run agent Python script.

Modify report:
    
    1. If only modify report view, edit "HpcVisualization.pbix" with PBI desktop. Note: just add/delete visuals with existing data, no new measure or aggregation shall be performed.
    2. If further modify dataset, e.g., adding new table/column, update "HpcDataset.json" accordingly.

About custom visuals:

    1. "TimeScopeRect" draws rectangle with arbitrary width according to time duration. It requires six columns from "NodeAllocation" table in PBI dataset, in order of "StartTimeMs, EndTimeMs, NodeId, NodeSize, CoreId, JobId", note: set all of them as "Don't Summarize".
    2. "TimeScopeLine" draws rectangle line with arbitrary width according to time duration. It requires four columns from "JobCost" table in PBI dataset, in order of "TimeMs, JobId, PricePrev, PriceCurr", note: set all of them as "Don't Summarize".
