import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DbConnectionService } from 'src/app/services/db-connection.service';
import { UserService } from 'src/app/services/user.service';
import { FormControl, FormGroup, UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import { ImageService } from 'src/app/services/image.service';
import { PropertiesService } from 'src/app/services/properties.service';
import { ListingModule } from '../listing.module';
import { DateRange, DefaultMatCalendarRangeStrategy, MAT_DATE_RANGE_SELECTION_STRATEGY, MatCalendar, MatCalendarCellClassFunction } from '@angular/material/datepicker';
import { promise } from 'protractor';

@Component({
  selector: 'app-detail',
  templateUrl: './listingdetail.component.html',
  styleUrls: ['./listingdetail.component.scss'],
  providers: [
    {
      provide: MAT_DATE_RANGE_SELECTION_STRATEGY,
      useClass: DefaultMatCalendarRangeStrategy,
    },
  ],
})
export class ListingDetailComponent implements OnInit {

  @ViewChild('bookings') calendar: MatCalendar<Date>;

  listing: object;
  error: string;
  form:UntypedFormGroup;
  transactions = [];
  reviews = [];
  avgScore: number = 0;
  sellerScore: number = 0;
  selectedTab = ""; // ["info", "reviews", "transactions"]
  loading = 0; // #asynchronous tasks running

  loadedBookings: number[] = [0, 0]; // [month, year]
  bookings = [];
  selectedDateRange: DateRange<Date>;
  selectedDate: Date;

  _onSelectedChange(date: Date): void {
    this.selectedDate = date;
    if (
      this.selectedDateRange &&
      this.selectedDateRange.start &&
      date > this.selectedDateRange.start &&
      !this.selectedDateRange.end
    ) {
      this.selectedDateRange = new DateRange(
        this.selectedDateRange.start,
        date
      );
    } else {
      this.selectedDateRange = new DateRange(date, null);
    }
  }

  dateClass: MatCalendarCellClassFunction<Date> = (cellDate, view) => {
    // Only highlight dates inside the month view.
    if (view === 'month') {
      // fetch bookings when not loaded
      if (this.loadedBookings[0] !== cellDate.getMonth() + 1 || this.loadedBookings[1] !== cellDate.getFullYear()){
        this.db.getListingBookings(this.listing['listingID'], cellDate.getMonth() + 1, cellDate.getFullYear()).then(r => {
            this.bookings = r['bookings'];
            console.log(this.bookings)
            // update calendar
            this.calendar.updateTodaysDate();
        });
        this.loadedBookings = [cellDate.getMonth() + 1, cellDate.getFullYear()];
      }
      let cellDateUTC = Date.UTC(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
      for (let i = 0; i < this.bookings.length; i++){
        let startDate = this.customToDate(this.bookings[i]['startDate']);
        let endDate = this.customToDate(this.bookings[i]['endDate']);
        if (cellDateUTC >= startDate && cellDateUTC <= endDate)
          return 'calendar-date-occupied';
      }
    }
    return '';
  };

  private customToDate(date: string){
    let d: number[] = date.split("-").map(x => parseInt(x))
    return Date.UTC(d[0], d[1]-1, d[2]);
  }

  private dateToYYYYMMDDformat(date: Date){
    const offset = date.getTimezoneOffset()
    let newDate = new Date(date.getTime() - (offset*60*1000))
    return newDate.toISOString().split('T')[0]
  }

  logBookings(bookings=this.bookings){
    return bookings.map(x => `(${x.startDate}) ${x.startTime} - ${x.endTime} (${x.endDate})`)
  }

  getTotalPrice(){
    return parseInt(this.listing['price']) * this.getTotalServiceAssets()
  }

  private getTotalServiceAssets(){
    if (this.ps.properties['Time Unit'].includes('Hour'))
      return parseInt(this.form.get('amountOfHours').value)
    else{
      if (this.selectedDateRange && this.selectedDateRange.start && this.selectedDateRange.end)
        return Math.round((this.selectedDateRange.end.valueOf() - this.selectedDateRange.start.valueOf()) / (1000 * 60 * 60 * 24));
      else
        return 0
    }
  }

  constructor(private route: ActivatedRoute,
    private db : DbConnectionService,
    private user: UserService,
    private router: Router,
    public image: ImageService,
    public ps: PropertiesService) {
      console.log(ps.properties)
      
      // initialize form field
      this.form = new UntypedFormGroup({
        numberOfAssets: new FormControl(1),
        address: new UntypedFormControl(),
        date: new UntypedFormControl(),
        startTime: new UntypedFormControl(),
        amountOfHours: new UntypedFormControl(1)
      });
    }

  ngOnInit(): void {

    /* this.db.getProperties().then (r => {
      this.properties = r
      }
    ); */
    // get url query params
    this.route.params.subscribe(params => {
      this.error = "";
      // when detail-type is given in url
      if (params.type && ["info", "reviews", "transactions"].includes(params.type))
        this.selectedTab = params.type;
      // get listingdata
      this.db.getListing(params.id)
        .then(l => {
          this.db.getCategories().then(c => {
            let categories = [];
            Object.entries(c).forEach(([k, v]) => {
              let v2 = v.filter(x => l["categories"].includes(x));
              if (v2.length > 0)
                categories.push([k, v2])
            })
            this.listing = l;
            this.listing['categories'] = categories;
            this.loadReviews();
            // if listing if made by logged in user show transactions
            if (this.listing['userID'] === this.user.getId())
              this.loadTransactions();
            this.ps.properties['Review System'].push('By Customer of Provider')
            if (this.ps.properties['Review System'].includes('By Customer of Provider')){
              this.db.getSellerRating(this.listing['userID']).then(r => {
                this.sellerScore = r['sellerScore']
              })
            }
          })
        })
        .catch(err => this.error = err.error.message);
    })
  }

  // when type was given, scroll to given type when all data is loaded
  onFinishLoading() {
    this.loading -= 1;
    if (this.loading !== 0) return;
    if (this.selectedTab)
      setTimeout(() => document.getElementById(this.selectedTab).scrollIntoView(), 50); // give time for transactions table to build
    else
      this.selectedTab = 'info';
  }

  // get reviews
  loadReviews(){
    this.loading += 1;
    this.db.getListingReviews(this.listing['listingID']).then(r => {
      this.avgScore = r['score'];
      this.reviews = r['reviews'];
      this.onFinishLoading();
    }).catch(err => this.error = err.error.message)
  }

  // get transactions
  loadTransactions(){
    this.loading += 1;
    this.db.getListingTransactions(this.listing['listingID'], this.user.getLoginToken())
      .then(b => {
        this.transactions = b['transactions']
        console.log(this.transactions)
        this.transactions.forEach(t => {
          this.db.getUserReviews(t['customerID']).then(r => {
            t['userReviews'] = r['reviews']
            t['userScore'] = r['score']
          });
          
          // load bookings when applicable
          if (this.ps.properties['Listing Kind'].includes('Service') && this.ps.properties['Frequency'].includes('Recurring')){
            this.db.getTransactionBookings(this.user.getLoginToken(), t['transactionID']).then(r => {
              t['bookings'] = r['bookings']
            })
          }
          //console.log(this.transactions)
        })
        this.onFinishLoading();
      }).catch(err => {
        this.error = err.error.message
      })
      
  }

  // delete listing
  cancelListing(id: number){
    this.db.cancelListing(id, this.user.getLoginToken()).then(_ => {
      this.listing['status'] = 'cancelled'
      // update transaction data
      this.loadTransactions();
    })
  }

  // create transaction
  createTransaction(){
    // get form value
    let values = {...this.form.getRawValue()}
    values['numberOfAssets'] = this.getTotalServiceAssets()
    console.log(values)
    // add listingID to form values
    values['listingID'] = this.listing['listingID'];
    this.db.createTransaction(this.user.getLoginToken(), values).then(r => {
      console.log(r)
      if (this.ps.properties['Listing Kind'].includes('Service') && this.ps.properties['Frequency'].includes('Recurring')){
        let fields = {'transactionID': r['transactionID']};
        if (this.ps.properties['Time Unit'].includes('Day')){
          fields['startDate'] = this.dateToYYYYMMDDformat(this.selectedDateRange.start);
          fields['endDate'] = this.dateToYYYYMMDDformat(this.selectedDateRange.end);
        } else {
          fields['startDate'] = this.dateToYYYYMMDDformat(this.selectedDate);
          let endDate = new Date(this.selectedDate);
          endDate.setHours(values['startTime'].split(":")[0])
          endDate.setMinutes(values['startTime'].split(":")[1])
          endDate.setTime(endDate.getTime() + (values['amountOfHours']*60*60*1000))
          fields['endDate'] = this.dateToYYYYMMDDformat(endDate);
          fields['startTime'] = values['startTime'];
          fields['endTime'] = `${endDate.getHours()}:${endDate.getMinutes()}`
        }

        this.db.createBooking(this.user.getLoginToken(), fields).then(res => {
          this.transactionSuccess();
        }).catch(e => {
          this.db.cancelTransaction(r['transactionID'], this.user.getLoginToken()).then(console.log)
          this.error = `Booking failed: ${e.error.message}`
        })
      } else {
        this.transactionSuccess();
      }
      
      
    })
  }

  // helper function for createTransaction()
  transactionSuccess(){
    //sold when only 1 quantity exists
      if (this.ps.properties['Quantity']?.includes('One') && !this.ps.properties['Frequency']?.includes('Recurring')) {
        this.db.soldListingStatus(this.listing['listingID'])
      }
      // go to transactions
      this.router.navigate(['/transactions'])
  }

  // cancel transaction
  cancelTransaction(transactionId: number){
    this.db.cancelTransaction(transactionId, this.user.getLoginToken()).then(r => {
      // update transaction data
      this.loadTransactions();
    }).catch(r => this.error = r.error.message)
  }

  // confirm transaction payment
  confirmPayment(transactionId: number){
    this.db.confirmPayment(transactionId, this.user.getLoginToken()).then(r => {
      // update transaction data
      this.loadTransactions();
    }).catch(r => this.error = r.error.message)
  }

  contactOwner(){
    this.router.navigateByUrl(`/messages?id=${this.listing['userID']}`)
  }
}
