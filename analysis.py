import pymongo
import pandas as pd
import matplotlib.pyplot as plt

def run_analysis():
    client = pymongo.MongoClient("mongodb://localhost:27017/")
    db = client["egramseva"]
    df = pd.DataFrame(list(db.complaints.find()))

    if not df.empty:
        plt.figure(figsize=(8,5))
        df['category'].value_counts().plot(kind='bar', color='#2d6a4f')
        plt.title('Infrastructure Issue Distribution')
        plt.ylabel('Number of Reports')
        plt.tight_layout()
        plt.savefig('public/charts/analysis.png')
        print("Chart Updated!")

if __name__ == "__main__":
    run_analysis()