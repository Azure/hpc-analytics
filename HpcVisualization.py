import adal
import pyodbc
import requests
import json
from datetime import datetime, timedelta
import time
import random

# Configuration related
USER_ACCOUNT = r'******@microsoft.com'
USER_PASSWORD = r'******'

# PowerBI related configuration
REDIRECT_URI = r'https://login.live.com/oauth20_desktop.srf'
RESOURCE_URI = r'https://analysis.windows.net/powerbi/api'
AUTHORITY_URI = r'https://login.microsoftonline.com/common'
CLIENT_ID = r'******'

REPORT_NAME = r'HpcVisualizationReport'
DATASET_NAME = r'HpcVisualizationDataset'

REPORT_FILE_NAME = r'HpcVisualization.pbix'
DATASET_FILE_NAME = r'HpcDataset.json'

# SQL Sever related configuration
HOST_NAME = r'******'

# Local state related configuration
RECORD_FILE = r'HpcWorkRecord.json'

# Global variables
access_token = None
refresh_token = None
dataset_id = None
work_record = None
epoch = datetime(1970, 1, 1, 8)

# Authentication related functions
def acquire_token():    
    global access_token
    global refresh_token
    auth_context = adal.AuthenticationContext(AUTHORITY_URI)
    token = auth_context.acquire_token_with_username_password(resource=RESOURCE_URI, client_id=CLIENT_ID, username=USER_ACCOUNT, password=USER_PASSWORD)
    access_token = token['accessToken']
    refresh_token = token['refreshToken']
    print("acuqire_token ok")

def refresh_access_token():
    global access_token
    global refresh_token
    auth_context = adal.AuthenticationContext(AUTHORITY_URI)
    token = auth_context.acquire_token_with_refresh_token(refresh_token=refresh_token, client_id=CLIENT_ID, resource=RESOURCE_URI)
    access_token = token['accessToken']
    refresh_token = token['refreshToken']
    print("refresh_token ok")

# PowerBI service related functions
def push_report(report_file_name, report_name):
    url = f'https://api.powerbi.com/v1.0/myorg/imports?datasetDisplayName={report_name}'
    headers = {'Authorization': f'Bearer {access_token}', 'Content-Type': 'multipart/form-data'}
    report_file = open(report_file_name, 'rb')
    files = {'file': report_file}
    resp = requests.post(url, headers=headers, files = files)
    report_file.close()
    print(f"push_report {resp}")

    url = 'https://api.powerbi.com/v1.0/myorg/reports'
    headers = {'Authorization': f'Bearer {access_token}'}
    resp = requests.get(url, headers=headers)
    reports = resp.json()['value']
    for report in reports:
        if report['name'] == report_name:
            return report['id']
    return '0'

def push_dataset(dataset_file_name):
    url = 'https://api.powerbi.com/v1.0/myorg/datasets'
    headers = {'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'}
    dataset_file = open(dataset_file_name, 'r')
    dataset = json.load(dataset_file)
    resp = requests.post(url, headers=headers, json=dataset)
    dataset_file.close()
    print(f"push_dataset {resp}")
    return resp.json()['id']

def rebind_report(report_id, dataset_id):
    url = f'https://api.powerbi.com/v1.0/myorg/reports/{report_id}/Rebind'
    headers = {'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'}
    body = {'datasetId': dataset_id}
    resp = requests.post(url, headers=headers, json=body)
    print(f"rebind_report {resp}")

def set_dataset_id():
    global dataset_id
    url = 'https://api.powerbi.com/v1.0/myorg/datasets'
    headers = {'Authorization': f'Bearer {access_token}'}
    resp = requests.get(url, headers=headers)
    datasets = resp.json()['value']
    for dataset in datasets:
        if dataset['name'] == DATASET_NAME:
            dataset_id = dataset['id']
            print("set_dataset_id ok")
            return
    
    # target dataset does not exist, push it
    report_id = push_report(REPORT_FILE_NAME, REPORT_NAME)
    dataset_id = push_dataset(DATASET_FILE_NAME)
    rebind_report(report_id, dataset_id)
    print("set_dataset_id ok")

def post_row(table_name, row):
    url = f'https://api.powerbi.com/v1.0/myorg/datasets/{dataset_id}/tables/{table_name}/rows'
    headers = {'Authorization': f'Bearer {access_token}'}
    body = {"rows": [row]}
    print(row)
    resp = requests.post(url, headers=headers, json=body)
    print(f"post_row to {table_name} {resp}\n")

# SQL server connection
def connect_sql():
    connString = 'Driver={SQL Server};' + f'Server={HOST_NAME}; Database=HPCScheduler; Trusted_connection=yes;'
    connection = pyodbc.connect(connString)
    return connection.cursor()    

# Work record in case of crash
def load_work_record():
    global work_record
    record_file = open(RECORD_FILE, 'r')
    work_record = json.load(record_file)
    record_file.close()

def save_work_record():
    global work_record
    record_file = open(RECORD_FILE, 'w')
    json.dump(work_record, record_file)
    record_file.close()  

# Following functions deal with data push to PowerBI service 
# JobInfo table related functions
def get_job_user(job_id):
    # random result for test
    users = ['Alice', 'Bob', 'Jenny', 'Vencent', 'FAREAST/t-wem', 'Jack']
    return users[random.randint(0, 5)]

    sql_cursor = connect_sql()
    sql_cursor.execute(f"SELECT CredentialId FROM dbo.Job WHERE Id = '{job_id}'")
    row = sql_cursor.fetchone()
    if row == None or row[0] == None:
        return 'Nobody'
    credential_id = row[0]
    sql_cursor.execute(f"SELECT OwnerId FROM dbo.Credential WHERE Id = '{credential_id}'")
    row = sql_cursor.fetchone()
    if row == None or row[0] == None:
        return 'Nobody'
    owner_id = row[0]
    sql_cursor.execute(f"SELECT Name FROM dbo.SID WHERE Id = '{owner_id}'")
    row = sql_cursor.fetchone()
    if row == None or row[0] == None:
        return 'Nobody'
    return row[0]

def update_job_info_table():
    global work_record
    last_id = work_record['JobInfo_LastId']
    sql_cursor = connect_sql()
    sql_cursor.execute("SELECT Id, JobId, RequeueId, SubmitTime, StartTime, EndTime FROM dbo.JobHistory " +
                       f"WHERE Id > '{last_id}' and Event = 1")
    row = sql_cursor.fetchone()
    while row and row[0] != None:
        work_record['JobInfo_LastId'] = row[0]
        save_work_record()
        item = {
            "JobId": row[1],
            "User": get_job_user(row[1]),
            "SubmitDate": row[3].strftime('%Y-%m-%d 00:00:00.0'),
            "SubmitTime": row[3].hour,
            "RequeueCount": row[2],
            "WaitingTime": (row[4] - row[3]).total_seconds(),
            "RunningTime": (row[5] - row[4]).total_seconds()
        }
        post_row('JobInfo', item)
        row = sql_cursor.fetchone()

# JobCost table related functions
def get_node_price(node_id):
    return 1.0

def update_job_cost_for_job(job_id):
    events = []
    sql_cursor = connect_sql()
    sql_cursor.execute("SELECT NodeId, StartTime, EndTime FROM dbo.AllocationHistory " +
                       f"WHERE JobId = {job_id} and TaskId = 0")
    row = sql_cursor.fetchone()
    while row and row[0] != None:
        events.append({"time": (row[1] - epoch).total_seconds() * 1000.0, "node_id": row[0], "change": "add"})
        events.append({"time": (row[2] - epoch).total_seconds() * 1000.0, "node_id": row[0], "change": "sub"})
        row = sql_cursor.fetchone()
    
    item = {
        "JobId": job_id,
        "TimeMs": 0,
        "CoresPrev": 0,
        "CoresCurr": 0,
        "PricePrev": 0.0,
        "PriceCurr": 0.0
    }
    for event in sorted(events, key=lambda k: k['time']):
        if event['time'] != item['TimeMs']:
            if item['TimeMs'] != 0: 
                post_row("JobCost", item)
            item['TimeMs'] = event['time']
            item['CoresPrev'] = item['CoresCurr']
            item['PricePrev'] = item['PriceCurr']
        if event['change'] == 'add':
            item['CoresCurr'] += 1
            item['PriceCurr'] += get_node_price(event['node_id'])
        else:
            item['CoresCurr'] -= 1
            item['PriceCurr'] -= get_node_price(event['node_id'])
    post_row("JobCost", item)

def update_job_cost_table():
    global work_record
    last_id = work_record['JobCost_LastId']
    sql_cursor = connect_sql()
    sql_cursor.execute(f"SELECT Id, JobId FROM dbo.JobHistory WHERE Id > '{last_id}' and Event = 1")
    row = sql_cursor.fetchone()
    while row and row[0] != None:
        work_record['JobCost_LastId'] = row[0]
        save_work_record()
        job_id = row[1]
        update_job_cost_for_job(job_id)
        row = sql_cursor.fetchone()

# TaskBill table related functions
def calculate_task_bill_for_task(task_id, total_requeue_count):
    effected = 0.0
    wasted = 0.0
    sql_cursor = connect_sql()
    sql_cursor.execute("SELECT NodeId, TaskRequeueCount, StartTime, EndTime FROM dbo.AllocationHistory " +
                       f"WHERE TaskId = '{task_id}'")
    row = sql_cursor.fetchone()
    while row and row[0] != None:
        price = get_node_price(row[0])
        duration = (row[3] - row[2]).total_seconds()
        if row[1] == total_requeue_count:
            effected += duration * price
        else:
            wasted += duration * price
        row = sql_cursor.fetchone()
    return {"Effected": effected, "Wasted": wasted}

def update_task_bill_for_job(job_id):
    sql_cursor = connect_sql()
    sql_cursor.execute(f"SELECT Id, RequeueCount FROM dbo.Task WHERE ParentJobId = '{job_id}'")
    row = sql_cursor.fetchone()
    while row and row[0] != None:
        task_id = row[0]
        requeue_count = row[1]
        item = calculate_task_bill_for_task(task_id, requeue_count)
        item['JobId'] = job_id
        item['TaskId'] = task_id
        item['RequeueCount'] = requeue_count
        post_row('TaskBill', item)
        row = sql_cursor.fetchone()

def update_task_bill_table():
    global work_record
    last_id = work_record['TaskBill_LastId']
    sql_cursor = connect_sql()
    sql_cursor.execute(f"SELECT Id, JobId FROM dbo.JobHistory WHERE Id > '{last_id}' and Event = 1")
    row = sql_cursor.fetchone()
    while row and row[0] != None:
        work_record['TaskBill_LastId'] = row[0]
        save_work_record()
        job_id = row[1]
        update_task_bill_for_job(job_id)
        row = sql_cursor.fetchone()

# NodeAllocation table related functions
def get_node_size(node_id):
    sql_cursor = connect_sql()
    sql_cursor.execute(f"SELECT NumCores FROM dbo.Node WHERE Id = '{node_id}'")
    row = sql_cursor.fetchone()
    if row and row[0] != None:
        return row[0]

def update_node_allocation_table():
    global work_record
    last_id = work_record['NodeAllocation_LastId']
    max_start_time = datetime(3000, 1, 1)
    sql_cursor = connect_sql()
    sql_cursor.execute("SELECT MIN(StartTime) FROM dbo.AllocationHistory WHERE EndTime IS NULL")
    row = sql_cursor.fetchone()
    while row and row[0] != None:
        max_start_time = row[0].strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        row = sql_cursor.fetchone()

    sql_cursor.execute("SELECT Id, NodeId, CoreId, JobId, StartTime, EndTime FROM dbo.AllocationHistory " + \
                       f"WHERE Id > '{last_id}' and StartTime < '{max_start_time}' and TaskId = 0")
    row = sql_cursor.fetchone()
    while row and row[0] != None:
        work_record['NodeAllocation_LastId'] = row[0]
        save_work_record()
        item = {
            "NodeId": row[1], 
            "NodeSize": get_node_size(row[1]),
            "CoreId": row[2],
            "JobId": row[3],
            "StartTimeMs": (row[4] - epoch).total_seconds() * 1000.0,
            "EndTimeMs": (row[5] - epoch).total_seconds() * 1000.0,
            "Time": row[4].strftime('%Y-%m-%d %H:00:00.0')
        }
        post_row('NodeAllocation', item)
        row = sql_cursor.fetchone()

# ClusterUtility table related functions
def calculate_node_utility_for_hour(node_id, right_time):
    capacity = 0.0
    usage = 0.0
    left_time = right_time - timedelta(hours = 1)
    sql_cursor = connect_sql()
    # calculate capacity of the node in term of core*hour
    sql_cursor.execute(f"SELECT NumCores FROM dbo.NodeName WHERE Id = {node_id}")
    row = sql_cursor.fetchone()
    if row == None or row[0] == None:
        return
    node_size = row[0]
    sql_cursor.execute("SELECT Event, EventTime FROM dbo.NodeHistory WHERE " +
                       f"NodeId = {node_id} and (Event = 3 or Event = 4)")
    row = sql_cursor.fetchone()
    previous_time = left_time
    while row and row[0] != None:
        event = row[0]
        current_time = row[1]
        if current_time >= left_time and current_time <= right_time:
            if event == 4:
                capacity += (current_time - previous_time).total_seconds() / 3600 * node_size
            previous_time = current_time
        elif current_time > right_time and previous_time < right_time:
            if event == 4:
                capacity += (right_time - previous_time).total_seconds() / 3600 * node_size
            previous_time = right_time
        row = sql_cursor.fetchone()
    if event == 3:
        capacity += (right_time - previous_time).total_seconds() / 3600 * node_size

    # calculate usage of the node in term of core*hour
    sql_cursor.execute("SELECT StartTime, EndTime FROM dbo.AllocationHistory WHERE " +
                       f"NodeId = {node_id} and TaskId = 0 and " +
                       f"StartTime < '{right_time}' and EndTime > '{left_time}'")
    row = sql_cursor.fetchone()
    while row and row[0] != None:
        start_time = row[0]
        end_time = row[1]
        if start_time < left_time:
            start_time = left_time
        if end_time > right_time:
            end_time = right_time
        usage += (end_time - start_time).total_seconds() / 3600 * 1
        row = sql_cursor.fetchone()
    
    return {"Capacity": capacity, "Usage": usage}

def update_cluster_utility_for_hour(current_time):
    sql_cursor = connect_sql()
    sql_cursor.execute("SELECT DISTINCT(NodeId) FROM dbo.NodeHistory")
    nodes = []
    row = sql_cursor.fetchone()
    while row and row[0] != None:
        nodes.append(row[0])
        row = sql_cursor.fetchone()

    item = {
        "Time": (current_time - timedelta(hours=1)).strftime('%Y-%m-%d %H:00:00.0'),
        "Capacity": 0.0,
        "Usage": 0.0,
        "Utility": 0.0
    }    
    for node in nodes:
        utility = calculate_node_utility_for_hour(node, current_time)
        item['Capacity'] += utility['Capacity']
        item['Usage'] += utility['Usage']
    
    if item['Capacity'] > 0.0:
        item['Utility'] = item['Usage'] / item['Capacity']
    post_row('ClusterUtility', item)

def update_cluster_utility_table():
    global work_record
    last_time = datetime.strptime(work_record['ClusterUtility_LastTime'], '%Y-%m-%d %H:%M:%S.%f')
    sql_cursor = connect_sql()
    sql_cursor.execute("SELECT MIN(StartTime) FROM dbo.AllocationHistory")
    row = sql_cursor.fetchone()
    if row == None or row[0] == None:
        return
    round_time = row[0].replace(microsecond=0, second=0, minute=0)
    if last_time < round_time:
        last_time = round_time

    next_time = last_time + timedelta(hours=1)   
    while True:     
        sql_cursor.execute("SELECT MAX(StartTime) FROM dbo.AllocationHistory")
        row = sql_cursor.fetchone()
        if row == None or row[0] == None or row[0] <= next_time:
            return
        work_record['ClusterUtility_LastTime'] = next_time.strftime('%Y-%m-%d %H:%M:%S.%f')
        save_work_record()
        update_cluster_utility_for_hour(next_time)
        next_time += timedelta(hours=1)


# main loop
if __name__ == '__main__':
    previous_time = datetime.now()
    acquire_token()
    set_dataset_id()
    load_work_record()
    while True:
        update_job_info_table()
        update_job_cost_table()
        update_task_bill_table()
        update_node_allocation_table()
        update_cluster_utility_table()
        print("A turn finished")
        current_time = datetime.now()
        # refresh token every 50 minutes, as it expires at 60 minutes
        if current_time - previous_time > timedelta(minutes=50):
            previous_time = current_time
            refresh_access_token()
        time.sleep(10)

